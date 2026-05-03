from __future__ import annotations

import asyncio
import logging
from math import asin, cos, radians, sin, sqrt
from typing import Any

import httpx

from app.core.config import Settings
from app.models.schemas import AlertAuditEntry, Severity, SourceKind, ThreatEvent, new_id, utc_now
from app.repositories.store import SQLiteStore
from app.services.pipeline import run_alert_pipeline
from app.services.supabase_audit import SupabaseAuditService
from app.services.supabase_household import CAL_POLY_HOME, SupabaseHouseholdService

logger = logging.getLogger("uvicorn")

USGS_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson"
POLL_INTERVAL = 60


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return 2 * 6371 * asin(sqrt(a))


def _mag_to_severity(mag: float) -> Severity:
    if mag >= 6.0:
        return Severity.EXTREME
    if mag >= 4.5:
        return Severity.HIGH
    if mag >= 3.5:
        return Severity.MODERATE
    return Severity.LOW


class USGSPoller:
    def __init__(self) -> None:
        self._audit: SupabaseAuditService | None = None

    async def run(self, store: SQLiteStore, settings: Settings) -> None:
        self._audit = SupabaseAuditService(settings)
        await self._audit.bootstrap()
        while True:
            try:
                await self._poll(store, settings)
            except Exception as exc:
                logger.warning("USGSPoller error: %s", exc)
            await asyncio.sleep(POLL_INTERVAL)

    async def _poll(self, store: SQLiteStore, settings: Settings) -> None:
        # Resolve household location
        home_lat, home_lng = CAL_POLY_HOME
        try:
            household = await SupabaseHouseholdService(settings).get_household()
            if household and household.members:
                loc = household.members[0].location
                if loc:
                    home_lat, home_lng = loc.latitude, loc.longitude
        except Exception:
            pass

        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(USGS_URL)
            response.raise_for_status()
            features: list[dict[str, Any]] = response.json().get("features") or []

        logger.info("USGSPoller: polled — %d feature(s) returned", len(features))

        for feature in features:
            props = feature.get("properties") or {}
            eq_id = str(feature.get("id") or "")
            if not eq_id:
                continue

            coords = (feature.get("geometry") or {}).get("coordinates") or []
            if len(coords) < 2:
                continue
            eq_lng, eq_lat = float(coords[0]), float(coords[1])

            dist_km = _haversine_km(home_lat, home_lng, eq_lat, eq_lng)
            if dist_km > settings.alert_radius_km:
                continue

            if self._audit.has_entry(SourceKind.USGS, eq_id):
                logger.info("USGSPoller: skipping already-seen eq_id=%s", eq_id[:60])
                continue

            mag = float(props.get("mag") or 0)
            severity = _mag_to_severity(mag)
            title = str(props.get("title") or f"M {mag} earthquake")
            place = str(props.get("place") or "unknown location")
            source_url = props.get("url") or None
            ts_ms = props.get("time")
            issued_at = utc_now()
            if ts_ms:
                from datetime import datetime, timezone
                issued_at = datetime.fromtimestamp(int(ts_ms) / 1000, tz=timezone.utc)

            event = ThreatEvent(
                id=f"usgs_{new_id('live')}",
                event_type="earthquake",
                title=title,
                description=f"M{mag} earthquake {place}. Distance: {dist_km:.1f} km from household.",
                severity=severity,
                location_label=place,
                issued_at=issued_at,
                source_kind=SourceKind.USGS,
                source_name="USGS Earthquake Hazards Program",
                source_url=source_url,
                is_live=True,
                is_simulated=False,
                demo_mode=False,
                latitude=eq_lat,
                longitude=eq_lng,
                raw={"usgs_id": eq_id, "mag": mag, "place": place},
            )

            entry = AlertAuditEntry(
                source_kind=SourceKind.USGS,
                source_id=eq_id,
                event_type="earthquake",
                severity=severity,
                title=title,
                pipeline_triggered=True,
                raw=props,
            )
            await self._audit.add_entry(entry)
            logger.info("USGSPoller: new earthquake ingested: %s", title)
            await run_alert_pipeline(event, store, settings)
