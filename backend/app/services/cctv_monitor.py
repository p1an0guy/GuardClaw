from __future__ import annotations

import asyncio
import logging
import os

from app.core.config import Settings
from app.services.camera_service import CameraService
from app.services.cctv_alert_pipeline import CCTVAlertPipeline
from app.services.cctv_detector import CCTVDetector

logger = logging.getLogger(__name__)


class CCTVMonitor:
    """Coordinates camera detection workers and alert pipeline."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.camera_service = CameraService(settings)
        self.pipeline = CCTVAlertPipeline(settings)
        self._tasks: list[asyncio.Task] = []
        self._detectors: dict[str, CCTVDetector] = {}

    async def start(self) -> None:
        """Fetch cameras and start detection workers."""
        try:
            cameras = await self.camera_service.list_cameras()
        except Exception as exc:
            logger.error("Failed to fetch cameras: %s", exc)
            return

        for cam in cameras:
            if not cam.get("enabled") or not cam.get("stream_url"):
                continue
            camera_id = str(cam["id"])
            source = cam["stream_url"]
            # Resolve relative paths against the configured base path
            if not source.startswith(("rtsp://", "http://", "https://", "/")):
                source = os.path.join(self.settings.cctv_video_base_path, source)
            detector = CCTVDetector(
                camera_id=camera_id,
                source=source,
                fps=2,
            )
            self._detectors[camera_id] = detector

            label = cam.get("label", "Unknown")
            location = cam.get("location_label", "Unknown")

            async def on_detected(cid: str, ts: float, conf: float, _label=label, _loc=location, _det=detector) -> None:
                try:
                    active = await self.camera_service.is_schedule_active(cid)
                except Exception:
                    active = False
                if not active:
                    logger.debug("Detection on camera %s but schedule not active; ignoring", cid)
                    return
                await self.pipeline.handle_detection(
                    camera_id=cid,
                    camera_label=_label,
                    location_label=_loc,
                    timestamp=ts,
                    confidence=conf,
                    buffer=_det.buffer,
                )

            task = asyncio.create_task(detector.run(on_detected))
            self._tasks.append(task)
            logger.info("Started CCTV detector for camera %s (%s)", camera_id, label)

    async def stop(self) -> None:
        """Cancel all detection tasks."""
        for task in self._tasks:
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()
        self._detectors.clear()
