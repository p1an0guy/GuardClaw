from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, TypeVar

from pydantic import BaseModel

from app.models.schemas import (
    ActiveIncidentResponse,
    ActionPlan,
    AlertAuditEntry,
    HouseholdState,
    SourceKind,
    ThreatEvent,
    TimelineEntry,
    new_id,
    utc_now,
)

T = TypeVar("T", bound=BaseModel)


class SQLiteStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path

    def initialize(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS kv_store (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS timeline (
                    id TEXT PRIMARY KEY,
                    incident_id TEXT,
                    value TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS alert_audit_log (
                    id TEXT PRIMARY KEY,
                    source_kind TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    value TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(source_kind, source_id)
                )
                """
            )
            conn.commit()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _encode_model(self, model: BaseModel) -> str:
        return json.dumps(model.model_dump(mode="json"), separators=(",", ":"))

    def _encode_value(self, value: dict[str, Any]) -> str:
        return json.dumps(value, separators=(",", ":"))

    def _upsert(self, key: str, value: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO kv_store (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                """,
                (key, value, now),
            )
            conn.commit()

    def _get_raw(self, key: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT value FROM kv_store WHERE key = ?", (key,)).fetchone()
        if row is None:
            return None
        return json.loads(row["value"])

    def set_household(self, household: HouseholdState) -> None:
        self._upsert("household", self._encode_model(household))

    def get_household(self) -> HouseholdState | None:
        raw = self._get_raw("household")
        return HouseholdState.model_validate(raw) if raw else None

    def set_active_incident(self, event: ThreatEvent, plan: ActionPlan) -> None:
        self._upsert(
            "active_incident",
            self._encode_value(
                {
                    "incident": event.model_dump(mode="json"),
                    "action_plan": plan.model_dump(mode="json"),
                    "camera_signal": plan.camera_signal.model_dump(mode="json") if plan.camera_signal else None,
                    "classification": plan.classification.model_dump(mode="json") if plan.classification else None,
                    "demo_mode": True,
                }
            ),
        )

    def get_active_incident(self) -> ActiveIncidentResponse:
        raw = self._get_raw("active_incident")
        if raw is None:
            return ActiveIncidentResponse()
        return ActiveIncidentResponse.model_validate(raw)

    def clear_timeline(self) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM timeline")
            conn.commit()

    def add_timeline(self, entry: TimelineEntry) -> TimelineEntry:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO timeline (id, incident_id, value, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (entry.id, entry.incident_id, self._encode_model(entry), entry.created_at.isoformat()),
            )
            conn.commit()
        return entry

    def list_timeline(self) -> list[TimelineEntry]:
        with self._connect() as conn:
            rows = conn.execute("SELECT value FROM timeline ORDER BY created_at ASC").fetchall()
        return [TimelineEntry.model_validate(json.loads(row["value"])) for row in rows]

    def acknowledge(self, target_id: str, acknowledged_by: str, note: str | None) -> TimelineEntry:
        acknowledged_at = utc_now()
        incident_id: str | None = None

        with self._connect() as conn:
            row = conn.execute("SELECT value FROM timeline WHERE id = ?", (target_id,)).fetchone()
            if row is not None:
                existing = TimelineEntry.model_validate(json.loads(row["value"]))
                incident_id = existing.incident_id
                metadata = dict(existing.metadata)
                metadata["acknowledged_by"] = acknowledged_by
                if note:
                    metadata["acknowledgement_note"] = note
                updated = existing.model_copy(
                    update={"acknowledged_at": acknowledged_at, "metadata": metadata}
                )
                conn.execute(
                    "UPDATE timeline SET value = ? WHERE id = ?",
                    (self._encode_model(updated), target_id),
                )

            ack_entry = TimelineEntry(
                id=new_id("ack"),
                incident_id=incident_id,
                kind="acknowledgement",
                title="Action acknowledged",
                detail=f"{acknowledged_by} acknowledged {target_id}.",
                actor=acknowledged_by,
                metadata={"target_id": target_id, "note": note},
            )
            conn.execute(
                """
                INSERT INTO timeline (id, incident_id, value, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (
                    ack_entry.id,
                    ack_entry.incident_id,
                    self._encode_model(ack_entry),
                    ack_entry.created_at.isoformat(),
                ),
            )
            conn.commit()

        return ack_entry

    def has_audit_entry(self, source_kind: SourceKind, source_id: str) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM alert_audit_log WHERE source_kind = ? AND source_id = ?",
                (source_kind.value, source_id),
            ).fetchone()
        return row is not None

    def add_audit_entry(self, entry: AlertAuditEntry) -> AlertAuditEntry:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO alert_audit_log (id, source_kind, source_id, value, created_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(source_kind, source_id) DO NOTHING
                """,
                (entry.id, entry.source_kind.value, entry.source_id, self._encode_model(entry), entry.ingested_at.isoformat()),
            )
            conn.commit()
        return entry

    def list_audit_log(self) -> list[AlertAuditEntry]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT value FROM alert_audit_log ORDER BY created_at DESC"
            ).fetchall()
        return [AlertAuditEntry.model_validate(json.loads(row["value"])) for row in rows]
