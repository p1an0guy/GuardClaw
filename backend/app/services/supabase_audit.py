from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import Settings
from app.models.schemas import AlertAuditEntry, SourceKind

logger = logging.getLogger("uvicorn")


class SupabaseAuditService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._seen: set[tuple[str, str]] = set()  # in-memory dedup cache

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

    def has_entry(self, source_kind: SourceKind, source_id: str) -> bool:
        return (source_kind.value, source_id) in self._seen

    async def bootstrap(self) -> None:
        """Seed _seen from existing DB rows so restarts don't produce duplicates."""
        logger.info("SupabaseAudit bootstrap: starting")
        if not self._configured():
            logger.warning("SupabaseAudit bootstrap: skipped (not configured)")
            return
        async with httpx.AsyncClient(timeout=8, headers=self._headers()) as client:
            response = await client.get(
                f"{self._base()}/rest/v1/alert_audit_log",
                params={"select": "source_kind,source_id"},
            )
            response.raise_for_status()
        for row in response.json():
            self._seen.add((row["source_kind"], row["source_id"]))
        logger.info("SupabaseAudit bootstrap: complete, loaded %d seen entries", len(self._seen))

    async def add_entry(self, entry: AlertAuditEntry) -> None:
        key = (entry.source_kind.value, entry.source_id)
        if not self._configured():
            logger.debug("SupabaseAudit: not configured, caching locally source_id=%s", entry.source_id)
            self._seen.add(key)
            return
        async with httpx.AsyncClient(timeout=8, headers={**self._headers(), "Prefer": "return=minimal,resolution=ignore-duplicates"}) as client:
            response = await client.post(
                f"{self._base()}/rest/v1/alert_audit_log",
                json={
                    "id": entry.id,
                    "source_kind": entry.source_kind.value,
                    "source_id": entry.source_id,
                    "event_type": entry.event_type,
                    "severity": entry.severity.value,
                    "title": entry.title,
                    "ingested_at": entry.ingested_at.isoformat(),
                    "pipeline_triggered": entry.pipeline_triggered,
                    "raw": entry.raw,
                },
            )
            if response.status_code == 200 or response.status_code == 201:
                logger.info("SupabaseAudit: inserted source_kind=%s source_id=%s title=%r", entry.source_kind.value, entry.source_id, entry.title)
            elif response.status_code == 204:
                logger.info("SupabaseAudit: skipped (duplicate) source_kind=%s source_id=%s", entry.source_kind.value, entry.source_id)
            elif not response.is_success:
                logger.error("SupabaseAudit: insert failed status=%s body=%s", response.status_code, response.text[:300])
            response.raise_for_status()
        self._seen.add(key)

    async def list_entries(self) -> list[AlertAuditEntry]:
        if not self._configured():
            return []
        async with httpx.AsyncClient(timeout=8, headers=self._headers()) as client:
            response = await client.get(
                f"{self._base()}/rest/v1/alert_audit_log",
                params={"order": "ingested_at.desc", "limit": "100"},
            )
            response.raise_for_status()
            rows: list[dict[str, Any]] = response.json()

        return [
            AlertAuditEntry(
                id=row["id"],
                source_kind=SourceKind(row["source_kind"]),
                source_id=row["source_id"],
                event_type=row["event_type"],
                severity=row["severity"],
                title=row["title"],
                ingested_at=row["ingested_at"],
                pipeline_triggered=row["pipeline_triggered"],
                raw=row.get("raw") or {},
            )
            for row in rows
        ]
