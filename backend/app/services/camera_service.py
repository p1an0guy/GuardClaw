from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.config import Settings


class CameraService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=8,
            headers={
                "apikey": self.settings.supabase_key,
                "Authorization": f"Bearer {self.settings.supabase_key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
        )

    def _base(self) -> str:
        return self.settings.supabase_url.rstrip("/")

    async def list_cameras(self) -> list[dict[str, Any]]:
        async with self._client() as client:
            r = await client.get(
                f"{self._base()}/rest/v1/cameras",
                params={"family_id": f"eq.{self.settings.supabase_family_id}", "select": "*"},
            )
            r.raise_for_status()
            return r.json()

    async def get_camera(self, camera_id: str) -> dict[str, Any] | None:
        async with self._client() as client:
            r = await client.get(
                f"{self._base()}/rest/v1/cameras",
                params={"id": f"eq.{camera_id}", "select": "*"},
            )
            r.raise_for_status()
            data = r.json()
            return data[0] if data else None

    async def create_camera(self, label: str, location_label: str, stream_url: str | None) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "family_id": self.settings.supabase_family_id,
            "label": label,
            "location_label": location_label,
            "enabled": True,
        }
        if stream_url is not None:
            payload["stream_url"] = stream_url
        async with self._client() as client:
            r = await client.post(f"{self._base()}/rest/v1/cameras", json=payload)
            r.raise_for_status()
            return r.json()[0]

    async def update_camera(self, camera_id: str, **kwargs: Any) -> dict[str, Any]:
        payload = {k: v for k, v in kwargs.items() if v is not None}
        async with self._client() as client:
            r = await client.patch(
                f"{self._base()}/rest/v1/cameras",
                params={"id": f"eq.{camera_id}"},
                json=payload,
            )
            r.raise_for_status()
            return r.json()[0]

    async def delete_camera(self, camera_id: str) -> None:
        async with self._client() as client:
            r = await client.delete(
                f"{self._base()}/rest/v1/cameras",
                params={"id": f"eq.{camera_id}"},
            )
            r.raise_for_status()

    async def list_schedules(self, camera_id: str) -> list[dict[str, Any]]:
        async with self._client() as client:
            r = await client.get(
                f"{self._base()}/rest/v1/camera_alert_schedules",
                params={"camera_id": f"eq.{camera_id}", "select": "*"},
            )
            r.raise_for_status()
            return r.json()

    async def create_schedule(
        self, camera_id: str, day_of_week: int, start_time: str, end_time: str
    ) -> dict[str, Any]:
        payload = {
            "camera_id": camera_id,
            "family_id": self.settings.supabase_family_id,
            "day_of_week": day_of_week,
            "start_time": start_time,
            "end_time": end_time,
            "enabled": True,
        }
        async with self._client() as client:
            r = await client.post(f"{self._base()}/rest/v1/camera_alert_schedules", json=payload)
            r.raise_for_status()
            return r.json()[0]

    async def delete_schedule(self, schedule_id: str) -> None:
        async with self._client() as client:
            r = await client.delete(
                f"{self._base()}/rest/v1/camera_alert_schedules",
                params={"id": f"eq.{schedule_id}"},
            )
            r.raise_for_status()

    async def is_schedule_active(self, camera_id: str) -> bool:
        schedules = await self.list_schedules(camera_id)
        now = datetime.now(timezone.utc)
        current_dow = now.weekday()  # 0=Monday … 6=Sunday
        current_time = now.time().replace(tzinfo=None)

        for s in schedules:
            if not s.get("enabled"):
                continue
            if s.get("day_of_week") != current_dow:
                continue
            start = _parse_time(s["start_time"])
            end = _parse_time(s["end_time"])
            if start is None or end is None:
                continue
            if start <= end:
                if start <= current_time <= end:
                    return True
            else:
                # cross-midnight: active if after start OR before end
                if current_time >= start or current_time <= end:
                    return True
        return False


def _parse_time(value: str) -> Any:
    from datetime import time
    try:
        parts = value.split(":")
        return time(int(parts[0]), int(parts[1]))
    except Exception:
        return None
