from __future__ import annotations

from app.core.config import Settings
from app.models.schemas import CameraSignal, utc_now


class CameraSignalService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def create_signal(self, include_camera: bool, scenario: str) -> CameraSignal | None:
        if not include_camera:
            return None

        label = "Front walkway CCTV"
        summary = "Prerecorded demo clip shows motion near the home entry and confirms occupancy context."
        if scenario == "driveway":
            label = "Driveway CCTV"
            summary = "Prerecorded demo clip shows a vehicle passing near the driveway."
        elif scenario == "quiet_home":
            summary = "Prerecorded demo clip shows no urgent activity, but home occupancy remains confirmed."

        return CameraSignal(
            label=label,
            clip_url=self.settings.cctv_clip_url,
            occupancy_confirmed=True,
            confidence=0.9 if scenario != "quiet_home" else 0.72,
            observed_at=utc_now(),
            summary=summary,
        )
