from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
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
        """Full pipeline: extract clip -> upload -> webhook -> notification."""
        clip_path = await self._extract_clip(buffer, camera_id, timestamp)
        if clip_path is None:
            logger.error("Failed to extract clip for camera %s", camera_id)
            return

        clip_url = await self._upload_clip(clip_path, camera_id, timestamp)
        await self._send_webhook(camera_id, camera_label, location_label, timestamp, confidence, clip_url)
        await self._write_notification(camera_label, location_label, confidence, clip_url)
        clip_path.unlink(missing_ok=True)

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

    async def _send_webhook(
        self,
        camera_id: str,
        camera_label: str,
        location_label: str,
        timestamp: float,
        confidence: float,
        clip_url: str | None,
    ) -> None:
        """Send signed webhook to Hermes via family-alert-triage with CCTV payload."""
        if not self.settings.hermes_webhook_url or not self.settings.hermes_webhook_secret:
            logger.info("Hermes webhook not configured; skipping CCTV alert webhook")
            return

        detected_at = datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()
        summary = f"Person detected at {camera_label} ({location_label}) with {confidence:.0%} confidence."
        if clip_url:
            summary += f" Clip: {clip_url}"

        payload = {
            "event_type": "cctv_motion_alert",
            "alert": {
                "id": f"cctv_{camera_id}_{int(timestamp)}",
                "source": "CCTV",
                "event": f"Person Detected at {camera_label}",
                "severity": "Severe",
                "urgency": "Immediate",
                "certainty": "Observed",
                "headline": f"Motion Alert: {camera_label}",
                "summary": summary,
                "area_label": location_label,
                "expires_at": None,
                "url": clip_url or "",
            },
            "family_candidates": [],
            "policy": {
                "allowed_channels": ["telegram", "email"],
                "max_recipients": 5,
                "require_notify_severities": ["Extreme", "Severe"],
            },
        }

        # Fetch household members to populate family_candidates
        try:
            from app.services.supabase_household import SupabaseHouseholdService
            household = await SupabaseHouseholdService(self.settings).get_household()
            if household:
                for member in household.members:
                    if member.role.value == "guardian":
                        payload["family_candidates"].append({
                            "person_id": member.id,
                            "display_name": member.name,
                            "telegram_chat_id": member.telegram_chat_id or "",
                            "email": member.phone_e164 or "",
                            "location_status": "inside_alert_area",
                            "last_seen_minutes": 0,
                            "safety_status": "unknown",
                        })
        except Exception:
            pass  # Best-effort; send without candidates if household fetch fails

        body = json.dumps(payload)
        signature = hmac.new(
            self.settings.hermes_webhook_secret.encode(), body.encode(), hashlib.sha256
        ).hexdigest()

        try:
            async with httpx.AsyncClient(timeout=self.settings.hermes_timeout_seconds) as client:
                r = await client.post(
                    self.settings.hermes_webhook_url,
                    content=body,
                    headers={
                        "Content-Type": "application/json",
                        "X-Webhook-Signature": signature,
                        "X-Request-ID": f"cctv_{camera_id}_{int(timestamp)}",
                    },
                )
                r.raise_for_status()
                logger.info("CCTV webhook sent for camera %s (status %d)", camera_id, r.status_code)
        except Exception as exc:
            logger.error("CCTV webhook failed for camera %s: %s", camera_id, exc)

    async def _write_notification(
        self,
        camera_label: str,
        location_label: str,
        confidence: float,
        clip_url: str | None,
    ) -> None:
        """Write a notification row to Supabase notifications table."""
        if not (self.settings.supabase_url and self.settings.supabase_key and self.settings.supabase_family_id):
            return

        base = self.settings.supabase_url.rstrip("/")
        body_text = f"Person detected at {camera_label} ({location_label}) with {confidence:.0%} confidence."
        if clip_url:
            body_text += f" Clip: {clip_url}"

        try:
            async with httpx.AsyncClient(timeout=5) as client:
                await client.post(
                    f"{base}/rest/v1/notifications",
                    json={
                        "family_id": self.settings.supabase_family_id,
                        "target_role": "guardian",
                        "title": f"Motion Alert: {camera_label}",
                        "body": body_text,
                    },
                    headers={
                        "apikey": self.settings.supabase_key,
                        "Authorization": f"Bearer {self.settings.supabase_key}",
                        "Content-Type": "application/json",
                        "Prefer": "return=minimal",
                    },
                )
        except Exception as exc:
            logger.error("Failed to write CCTV notification: %s", exc)
