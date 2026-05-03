from __future__ import annotations

import asyncio
import logging
import xml.etree.ElementTree as ET
from datetime import datetime

import httpx

from app.core.config import Settings
from app.models.schemas import (
    AlertAuditEntry,
    Severity,
    SourceKind,
    ThreatEvent,
    new_id,
    utc_now,
)
from app.repositories.store import SQLiteStore
from app.services.pipeline import run_alert_pipeline
from app.services.supabase_audit import SupabaseAuditService

logger = logging.getLogger("uvicorn")

POLL_INTERVAL = 60
FEED_URL = "https://alerts.fema.gov/cap/capfeed.php"
_ATOM = "http://www.w3.org/2005/Atom"
_CAP = "urn:oasis:names:tc:emergency:cap:1.2"


def _tag(ns: str, local: str) -> str:
    return f"{{{ns}}}{local}"


def _map_severity(value: str) -> Severity:
    v = value.strip().lower()
    if v == "extreme":
        return Severity.EXTREME
    if v == "severe":
        return Severity.HIGH
    if v == "moderate":
        return Severity.MODERATE
    return Severity.LOW


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _entry_to_threat_event(entry: ET.Element) -> ThreatEvent:
    def text(ns: str, local: str) -> str:
        el = entry.find(_tag(ns, local))
        return (el.text or "").strip() if el is not None else ""

    title = text(_ATOM, "title") or "IPAWS Alert"
    summary = text(_ATOM, "summary") or text(_ATOM, "content")
    updated = text(_ATOM, "updated")
    event_type = text(_CAP, "event") or "ipaws_alert"
    severity_raw = text(_CAP, "severity")
    area_desc = text(_CAP, "areaDesc")

    return ThreatEvent(
        id=f"ipaws_{new_id('live')}",
        event_type=event_type,
        title=title,
        description=summary or title,
        severity=_map_severity(severity_raw),
        location_label=area_desc or "California",
        issued_at=_parse_dt(updated) or utc_now(),
        source_kind=SourceKind.IPAWS,
        source_name="FEMA IPAWS CAP Feed",
        source_url=FEED_URL,  # type: ignore[arg-type]
        is_live=True,
        is_simulated=False,
        demo_mode=False,
        raw={"area_desc": area_desc, "severity_raw": severity_raw},
    )


def _is_california(entry: ET.Element) -> bool:
    area_el = entry.find(_tag(_CAP, "areaDesc"))
    if area_el is not None and area_el.text:
        text = area_el.text
        if "California" in text or " CA" in text or text.strip() == "CA":
            return True
    # Also check title/summary as fallback
    for local in ("title", "summary"):
        el = entry.find(_tag(_ATOM, local))
        if el is not None and el.text and "California" in el.text:
            return True
    return False


class IPAWSPoller:
    def __init__(self) -> None:
        self._audit: SupabaseAuditService | None = None

    async def run(self, store: SQLiteStore, settings: Settings) -> None:
        self._audit = SupabaseAuditService(settings)
        await self._audit.bootstrap()
        while True:
            try:
                await self._poll(store, settings)
            except Exception as exc:
                logger.warning("IPAWSPoller error: %s", exc)
            await asyncio.sleep(POLL_INTERVAL)

    async def _poll(self, store: SQLiteStore, settings: Settings) -> None:
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent": "GuardClaw/1.0 (hackathon demo)"}) as client:
            response = await client.get(FEED_URL)
            response.raise_for_status()
            body = response.text

        root = ET.fromstring(body)
        entries = root.findall(_tag(_ATOM, "entry"))
        logger.info("IPAWSPoller: polled — %d entry(ies) returned", len(entries))

        for entry in entries:
            id_el = entry.find(_tag(_ATOM, "id"))
            alert_id = (id_el.text or "").strip() if id_el is not None else ""
            if not alert_id:
                continue
            if not _is_california(entry):
                continue
            if self._audit.has_entry(SourceKind.IPAWS, alert_id):
                logger.info("IPAWSPoller: skipping already-seen id=%s", alert_id[:80])
                continue

            event = _entry_to_threat_event(entry)
            audit_entry = AlertAuditEntry(
                source_kind=SourceKind.IPAWS,
                source_id=alert_id,
                event_type=event.event_type,
                severity=event.severity,
                title=event.title,
                pipeline_triggered=True,
                raw=event.raw,
            )
            await self._audit.add_entry(audit_entry)
            logger.info("IPAWSPoller: new alert ingested: %s", event.title)
            await run_alert_pipeline(event, store, settings)
