from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any

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

NWS_AREA = "CA"  # California — location filtering handled on the frontend
POLL_INTERVAL = 60  # seconds


def _map_nws_severity(value: str) -> Severity:
    normalized = value.strip().lower()
    if normalized == "extreme":
        return Severity.EXTREME
    if normalized == "severe":
        return Severity.HIGH
    if normalized == "moderate":
        return Severity.MODERATE
    return Severity.LOW


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _props_to_threat_event(props: dict[str, Any], geometry: dict[str, Any] | None = None) -> ThreatEvent:
    severity = _map_nws_severity(str(props.get("severity") or "moderate"))
    issued = _parse_datetime(props.get("sent") or props.get("effective")) or utc_now()
    expires = _parse_datetime(props.get("expires"))
    headline = props.get("headline") or props.get("event") or "National Weather Service alert"
    lat: float | None = None
    lng: float | None = None
    if geometry:
        coords = geometry.get("coordinates")
        if coords and isinstance(coords, list) and len(coords) > 0:
            first = coords[0]
            if isinstance(first, list) and len(first) >= 2:
                lng, lat = float(first[0]), float(first[1])
    return ThreatEvent(
        id=f"nws_{new_id('live')}",
        event_type=str(props.get("event") or "weather_alert"),
        title=str(headline),
        description=str(props.get("description") or props.get("instruction") or "Live NWS alert."),
        severity=severity,
        location_label="California",
        issued_at=issued,
        expires_at=expires,
        source_kind=SourceKind.NWS,
        source_name="National Weather Service alerts API",
        source_url="https://api.weather.gov/alerts/active",
        is_live=True,
        is_simulated=False,
        demo_mode=False,
        latitude=lat,
        longitude=lng,
        raw={"nws_id": props.get("id"), "area_desc": props.get("areaDesc")},
    )


class NWSPoller:
    def __init__(self) -> None:
        self._audit: SupabaseAuditService | None = None

    async def run(self, store: SQLiteStore, settings: Settings) -> None:
        self._audit = SupabaseAuditService(settings)
        await self._audit.bootstrap()
        while True:
            try:
                await self._poll(store, settings)
            except Exception as exc:
                logger.warning("NWSPoller error: %s", exc)
            await asyncio.sleep(POLL_INTERVAL)

    async def _poll(self, store: SQLiteStore, settings: Settings) -> None:
        headers = {
            "User-Agent": "GuardClaw/1.0 (hackathon demo)",
            "Accept": "application/geo+json",
        }
        async with httpx.AsyncClient(timeout=8, headers=headers) as client:
            response = await client.get(
                "https://api.weather.gov/alerts/active",
                params={"area": NWS_AREA},
            )
            response.raise_for_status()
            features: list[dict[str, Any]] = response.json().get("features") or []

        logger.info("NWSPoller: polled area=%s — %d feature(s) returned", NWS_AREA, len(features))

        for feature in features:
            props = feature.get("properties") or {}
            nws_id = str(props.get("id") or "")
            seen = self._audit.has_entry(SourceKind.NWS, nws_id)
            if not nws_id or seen:
                if seen:
                    logger.debug("NWSPoller: skipping already-seen nws_id=%s", nws_id[:60])
                continue
            event = _props_to_threat_event(props, feature.get("geometry"))
            entry = AlertAuditEntry(
                source_kind=SourceKind.NWS,
                source_id=nws_id,
                event_type=event.event_type,
                severity=event.severity,
                title=event.title,
                pipeline_triggered=True,
                raw=props,
            )
            await self._audit.add_entry(entry)
            logger.info("NWSPoller: new alert ingested: %s", event.title)
            await run_alert_pipeline(event, store, settings)
