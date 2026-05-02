from __future__ import annotations

import asyncio
import logging
import os
import time
from collections import deque
from typing import Callable

import cv2
from ultralytics import YOLO

logger = logging.getLogger(__name__)

_BUFFER_SECONDS = 30
_COOLDOWN_SECONDS = 60
_RETRY_SECONDS = 10
_PERSON_CLASS = 0  # COCO class index for 'person'


class FrameBuffer:
    """Rolling buffer keeping the last 30 seconds of (timestamp, frame) tuples."""

    def __init__(self, fps: int) -> None:
        maxlen = _BUFFER_SECONDS * fps
        self._buf: deque[tuple[float, object]] = deque(maxlen=maxlen)
        self._fps = fps

    def add_frame(self, timestamp: float, frame: object) -> None:
        self._buf.append((timestamp, frame))

    def get_buffer(self, seconds_before: float, seconds_after: float) -> list[tuple[float, object]]:
        now = time.time()
        start = now - seconds_before
        end = now + seconds_after
        return [(ts, f) for ts, f in self._buf if start <= ts <= end]


class CCTVDetector:
    """Runs YOLOv8n person detection on a video source."""

    def __init__(self, camera_id: str, source: str, fps: int = 2) -> None:
        self.camera_id = camera_id
        self.source = source
        self.fps = fps
        self.buffer = FrameBuffer(fps)
        self._model: YOLO | None = None

    def _get_model(self) -> YOLO:
        if self._model is None:
            self._model = YOLO("yolov8n.pt")
        return self._model

    async def run(self, on_person_detected: Callable) -> None:
        loop = asyncio.get_running_loop()
        last_alert = 0.0

        while True:
            # Check source exists (for file paths)
            is_file = not self.source.startswith("rtsp://")
            if is_file and not os.path.exists(self.source):
                logger.warning("Video source not found: %s — retrying in %ds", self.source, _RETRY_SECONDS)
                await asyncio.sleep(_RETRY_SECONDS)
                continue

            cap: cv2.VideoCapture = await loop.run_in_executor(None, cv2.VideoCapture, self.source)
            if not cap.isOpened():
                logger.warning("Cannot open video source: %s — retrying in %ds", self.source, _RETRY_SECONDS)
                await asyncio.sleep(_RETRY_SECONDS)
                continue

            source_fps: float = cap.get(cv2.CAP_PROP_FPS) or 25.0
            frame_interval = max(1, round(source_fps / self.fps))

            try:
                frame_idx = 0
                while True:
                    ret, frame = await loop.run_in_executor(None, cap.read)
                    if not ret:
                        # End of file — loop back for mock mode
                        await loop.run_in_executor(None, cap.set, cv2.CAP_PROP_POS_FRAMES, 0)
                        frame_idx = 0
                        continue

                    ts = time.time()
                    if frame_idx % frame_interval == 0:
                        self.buffer.add_frame(ts, frame)

                        results = await loop.run_in_executor(
                            None, lambda f=frame: self._get_model()(f, verbose=False)
                        )
                        persons = [
                            box
                            for r in results
                            for box in r.boxes
                            if int(box.cls[0]) == _PERSON_CLASS
                        ]
                        if persons and (ts - last_alert) >= _COOLDOWN_SECONDS:
                            confidence = float(max(b.conf[0] for b in persons))
                            last_alert = ts
                            await on_person_detected(self.camera_id, ts, confidence)

                    frame_idx += 1
                    await asyncio.sleep(0)  # yield to event loop

            except asyncio.CancelledError:
                logger.info("CCTVDetector %s shutting down", self.camera_id)
                return
            finally:
                await loop.run_in_executor(None, cap.release)
