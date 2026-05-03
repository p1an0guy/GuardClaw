from __future__ import annotations

import asyncio
import logging
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import cv2
import httpx

from app.core.config import Settings
from app.services.cctv_detector import FrameBuffer

logger = logging.getLogger(__name__)


class CCTVAlertPipeline:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def handle_detection(
        self,
        camera_id: str,
        camera_label: str,
        location_label: str,
        timestamp: float,
        confidence: float,
        buffer: FrameBuffer,
    ) -> None:
        """Full pipeline: extract clip -> create ThreatEvent -> run unified alert pipeline."""
        clip_path = await self._extract_clip(buffer, camera_id, timestamp)
        clip_url: str | None = None
        if clip_path:
            clip_url = await self._upload_clip(clip_path, camera_id, timestamp)
            clip_path.unlink(missing_ok=True)

        await self._run_through_pipeline(camera_id, camera_label, location_label, timestamp, confidence, clip_url)

    async def run_simulated_detection(
        self,
        camera_id: str,
        camera_label: str,
        location_label: str,
        timestamp: float,
        confidence: float,
        clip_url: str | None,
    ) -> None:
        """Entry point for the simulate-detection API endpoint."""
        await self._run_through_pipeline(camera_id, camera_label, location_label, timestamp, confidence, clip_url)

    async def _run_through_pipeline(
        self,
        camera_id: str,
        camera_label: str,
        location_label: str,
        timestamp: float,
        confidence: float,
        clip_url: str | None,
    ) -> None:
        from app.db.session import store
        from app.models.schemas import CameraSignal, Severity, SourceKind, ThreatEvent, new_id, utc_now
        from app.services.pipeline import run_alert_pipeline

        detected_at = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        event = ThreatEvent(
            id=f"cctv_{camera_id}_{int(timestamp)}",
            event_type="cctv_person_detected",
            title=f"Person detected: {camera_label}",
            description=f"Person detected at {camera_label} ({location_label}) with {confidence:.0%} confidence.",
            severity=Severity.HIGH,
            location_label=location_label,
            issued_at=detected_at,
            source_kind=SourceKind.CCTV,
            source_name=f"CCTV {camera_label}",
            is_live=True,
            is_simulated=False,
            demo_mode=False,
            raw={"camera_id": camera_id, "confidence": confidence},
        )
        camera_signal = CameraSignal(
            label=camera_label,
            clip_url=clip_url or self.settings.cctv_clip_url,
            occupancy_confirmed=True,
            confidence=confidence,
            observed_at=detected_at,
            summary=f"Person detected at {camera_label} with {confidence:.0%} confidence.",
        )
        try:
            await run_alert_pipeline(event, store, self.settings, camera_signal_override=camera_signal)
        except Exception as exc:
            logger.error("CCTV unified pipeline failed for camera %s: %s", camera_id, exc)

    async def _extract_clip(self, buffer: FrameBuffer, camera_id: str, timestamp: float) -> Path | None:
        """Write buffer frames to a temp MP4 file using OpenCV."""
        frames = buffer.get_buffer(15.0, 15.0)
        if not frames:
            return None

        tmp_dir = Path(tempfile.gettempdir()) / "guardclaw_clips"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        ts_str = datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
        output_path = tmp_dir / f"{camera_id}_{ts_str}.mp4"

        loop = asyncio.get_running_loop()

        def _write():
            first_frame = frames[0][1]
            h, w = first_frame.shape[:2]
            fps = max(1, len(frames) // 30)
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            writer = cv2.VideoWriter(str(output_path), fourcc, fps, (w, h))
            for _, frame in frames:
                writer.write(frame)
            writer.release()
            return True

        ok = await loop.run_in_executor(None, _write)
        return output_path if ok else None

    async def _extract_and_upload_clip(self, source_path: str, camera_id: str, timestamp: float) -> str | None:
        """Extract a 25s clip from a video file and upload to Supabase Storage."""
        tmp_dir = Path(tempfile.gettempdir()) / "guardclaw_clips"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        ts_str = datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
        output_path = tmp_dir / f"{camera_id}_{ts_str}.mp4"

        loop = asyncio.get_running_loop()

        def _extract():
            cap = cv2.VideoCapture(source_path)
            if not cap.isOpened():
                return False
            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            writer = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))
            max_frames = int(fps * 25)
            count = 0
            while count < max_frames:
                ret, frame = cap.read()
                if not ret:
                    break
                writer.write(frame)
                count += 1
            writer.release()
            cap.release()
            return count > 0

        ok = await loop.run_in_executor(None, _extract)
        if not ok:
            logger.error("Failed to extract clip from %s", source_path)
            return None

        clip_url = await self._upload_clip(output_path, camera_id, timestamp)
        output_path.unlink(missing_ok=True)
        return clip_url

    async def _upload_clip(self, clip_path: Path, camera_id: str, timestamp: float) -> str | None:
        """Upload clip to Supabase Storage bucket 'cctv-clips'. Returns public URL."""
        if not (self.settings.supabase_url and self.settings.supabase_key):
            logger.warning("Supabase not configured; skipping clip upload")
            return None

        base = self.settings.supabase_url.rstrip("/")
        bucket = "cctv-clips"
        ts_str = datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
        object_path = f"{camera_id}/{ts_str}.mp4"
        headers = {
            "apikey": self.settings.supabase_key,
            "Authorization": f"Bearer {self.settings.supabase_key}",
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                with open(clip_path, "rb") as f:
                    content = f.read()
                r = await client.post(
                    f"{base}/storage/v1/object/{bucket}/{object_path}",
                    content=content,
                    headers={**headers, "Content-Type": "video/mp4", "x-upsert": "true"},
                )
                r.raise_for_status()
            return f"{base}/storage/v1/object/public/{bucket}/{object_path}"
        except Exception as exc:
            logger.error("Clip upload failed: %s", exc)
            return None
