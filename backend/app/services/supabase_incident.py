from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import Settings
from app.models.schemas import IncidentRecord, Severity, SourceKind

logger = logging.getLogger("uvicorn")


class SupabaseIncidentService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def _headers(self) -> dict[str, str]:
        return {
            "apikey": self.settings.supabase_key,
            "Authorization": f"Bearer {self.settings.supabase_key}",
            "Content-Type": "application/json",
        }

    def _base(self) -> str:
        return self.settings.supabase_url.rstrip("/")

    def _configured(self) -> bool:
        return bool(self.settings.supabase_url and self.settings.supabase_key)

    async def create_incident(self, record: IncidentRecord) -> None:
        if not self._configured():
            logger.debug("SupabaseIncident: not configured, skipping write")
            return
        async with httpx.AsyncClient(timeout=8, headers=self._headers()) as client:
            response = await client.post(
                f"{self._base()}/rest/v1/incidents",
                json={
                    "id": record.id,
                    "family_id": record.family_id,
                    "event_id": record.event_id,
                    "summary": record.summary,
                    "classification_level": record.classification_level,
                    "status": record.status,
                    "affected_members": record.affected_members,
                    "source_kind": record.source_kind.value,
                    "severity": record.severity.value,
                    "location_label": record.location_label,
                    "created_at": record.created_at.isoformat(),
                },
            )
            if response.is_success:
                logger.info("SupabaseIncident: created incident %s", record.id)
            else:
                logger.error("SupabaseIncident: insert failed status=%s body=%s", response.status_code, response.text[:300])

    async def get_latest(self) -> IncidentRecord | None:
        if not self._configured():
            return None
        async with httpx.AsyncClient(timeout=8, headers=self._headers()) as client:
            response = await client.get(
                f"{self._base()}/rest/v1/incidents",
                params={"order": "created_at.desc", "limit": "1", "family_id": f"eq.{self.settings.supabase_family_id}"},
            )
            response.raise_for_status()
            rows: list[dict[str, Any]] = response.json()
        if not rows:
            return None
        return self._row_to_record(rows[0])

    async def list_incidents(self, limit: int = 20) -> list[IncidentRecord]:
        if not self._configured():
            return []
        async with httpx.AsyncClient(timeout=8, headers=self._headers()) as client:
            response = await client.get(
                f"{self._base()}/rest/v1/incidents",
                params={"order": "created_at.desc", "limit": str(limit), "family_id": f"eq.{self.settings.supabase_family_id}"},
            )
            response.raise_for_status()
            rows: list[dict[str, Any]] = response.json()
        return [self._row_to_record(row) for row in rows]

    @staticmethod
    def _row_to_record(row: dict[str, Any]) -> IncidentRecord:
        return IncidentRecord(
            id=row["id"],
            family_id=row.get("family_id", ""),
            event_id=row["event_id"],
            summary=row["summary"],
            classification_level=row["classification_level"],
            status=row["status"],
            affected_members=row.get("affected_members") or [],
            source_kind=SourceKind(row["source_kind"]),
            severity=Severity(row["severity"]),
            location_label=row["location_label"],
            created_at=row["created_at"],
        )
