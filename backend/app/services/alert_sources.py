from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

from app.models.schemas import Severity, SimulateEventRequest, SourceKind, ThreatEvent, new_id, utc_now


NWS_SLO_POINT = "35.2828,-120.6596"


class AlertSourceService:
    async def create_event(self, request: SimulateEventRequest) -> ThreatEvent:
        if request.live and request.source == SourceKind.NWS:
            live_event = await self._try_live_nws(request.location_label)
            if live_event is not None:
                return live_event
        if request.live and request.source == SourceKind.IPAWS:
            archived_event = await self._try_openfema_ipaws(request.location_label)
            if archived_event is not None:
                return archived_event

        return self._fixture_for(request.source, request.location_label)

    async def _try_live_nws(self, location_label: str) -> ThreatEvent | None:
        url = "https://api.weather.gov/alerts/active"
        headers = {
            "User-Agent": "GuardClaw hackathon MVP (demo contact: local)",
            "Accept": "application/geo+json",
        }
        try:
            async with httpx.AsyncClient(timeout=8, headers=headers) as client:
                response = await client.get(url, params={"point": NWS_SLO_POINT})
                response.raise_for_status()
                payload = response.json()
        except Exception:
            return None

        features: list[dict[str, Any]] = payload.get("features") or []
        if not features:
            return None

        props = features[0].get("properties") or {}
        geometry = features[0].get("geometry")
        lat: float | None = None
        lng: float | None = None
        if geometry:
            coords = geometry.get("coordinates")
            if coords and isinstance(coords, list) and len(coords) > 0:
                first = coords[0]
                if isinstance(first, list) and len(first) >= 2:
                    lng, lat = float(first[0]), float(first[1])
        severity = self._map_nws_severity(str(props.get("severity") or "moderate"))
        issued = self._parse_datetime(props.get("sent") or props.get("effective")) or utc_now()
        expires = self._parse_datetime(props.get("expires"))
        headline = props.get("headline") or props.get("event") or "National Weather Service alert"

        return ThreatEvent(
            id=f"nws_{new_id('live')}",
            event_type=str(props.get("event") or "weather_alert"),
            title=str(headline),
            description=str(props.get("description") or props.get("instruction") or "Live NWS alert."),
            severity=severity,
            location_label=location_label,
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

    async def _try_openfema_ipaws(self, location_label: str) -> ThreatEvent | None:
        url = "https://www.fema.gov/api/open/v1/IpawsArchivedAlerts"
        params = {
            "$top": "1",
            "$orderby": "sent desc",
            "$select": "identifier,sender,sent,source,info.event,info.severity,info.headline,info.description,info.instruction,info.senderName",
        }
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                payload = response.json()
        except Exception:
            return None

        rows = payload.get("IpawsArchivedAlerts") or payload.get("value") or []
        if not rows:
            return None

        row = rows[0]
        info = row.get("info") if isinstance(row.get("info"), dict) else {}
        severity = self._map_cap_severity(str(info.get("severity") or row.get("info.severity") or "moderate"))
        issued = self._parse_datetime(row.get("sent")) or utc_now()
        event_name = str(info.get("event") or row.get("info.event") or "IPAWS archived alert")
        headline = str(info.get("headline") or row.get("info.headline") or event_name)
        description = str(
            info.get("description")
            or row.get("info.description")
            or info.get("instruction")
            or row.get("info.instruction")
            or "OpenFEMA archived IPAWS alert."
        )

        return ThreatEvent(
            id=f"ipaws_{new_id('archived')}",
            event_type=event_name,
            title=f"OpenFEMA archived IPAWS: {headline}",
            description=description,
            severity=severity,
            location_label=location_label,
            issued_at=issued,
            source_kind=SourceKind.IPAWS,
            source_name="OpenFEMA IPAWS Archived Alerts API (24-hour delayed)",
            source_url=url,
            is_live=False,
            is_simulated=False,
            demo_mode=False,
            raw={
                "identifier": row.get("identifier"),
                "sender": row.get("sender"),
                "source_freshness": "archived_official_delayed",
                "delay_note": "OpenFEMA IPAWS archive is delayed and must not be presented as live IPAWS.",
            },
        )

    def _fixture_for(self, source: SourceKind, location_label: str) -> ThreatEvent:
        now = utc_now()
        fixtures: dict[SourceKind, dict[str, Any]] = {
            SourceKind.NWS: {
                "event_type": "weather_alert",
                "title": "NWS severe weather alert replay",
                "description": (
                    "Simulated National Weather Service alert for strong winds and hazardous travel "
                    "near San Luis Obispo."
                ),
                "severity": Severity.HIGH,
                "source_name": "National Weather Service alerts API replay",
                "source_url": "https://api.weather.gov/alerts",
            },
            SourceKind.IPAWS: {
                "event_type": "public_safety_alert",
                "title": "FEMA IPAWS shelter advisory replay",
                "description": (
                    "Simulated IPAWS all-hazards advisory recommending that nearby residents stay indoors "
                    "while responders assess conditions."
                ),
                "severity": Severity.HIGH,
                "source_name": "FEMA IPAWS All-Hazards Feed replay",
                "source_url": "https://www.fema.gov/emergency-managers/practitioners/integrated-public-alert-warning-system",
            },
            SourceKind.SLO_COUNTY: {
                "event_type": "local_emergency_alert",
                "title": "San Luis Obispo County emergency alert replay",
                "description": (
                    "Simulated county emergency information update for a localized hazard near a residential area."
                ),
                "severity": Severity.MODERATE,
                "source_name": "San Luis Obispo County emergency information replay",
                "source_url": "https://www.slocounty.ca.gov/",
            },
            SourceKind.CAL_POLY: {
                "event_type": "campus_alert",
                "title": "Cal Poly SLO PolyAlert replay",
                "description": (
                    "Simulated campus safety advisory that could affect travel routes around Cal Poly and nearby homes."
                ),
                "severity": Severity.MODERATE,
                "source_name": "Cal Poly SLO emergency alert replay",
                "source_url": "https://afd.calpoly.edu/emergency/",
            },
        }
        data = fixtures[source]
        return ThreatEvent(
            id=new_id("event"),
            event_type=data["event_type"],
            title=data["title"],
            description=data["description"],
            severity=data["severity"],
            location_label=location_label,
            issued_at=now,
            source_kind=source,
            source_name=data["source_name"],
            source_url=data["source_url"],
            is_live=False,
            is_simulated=True,
            demo_mode=True,
            latitude=35.2828,
            longitude=-120.6596,
            raw={"fixture": True, "source": source.value, "source_freshness": "replay"},
        )

    def _map_nws_severity(self, value: str) -> Severity:
        normalized = value.strip().lower()
        if normalized == "extreme":
            return Severity.EXTREME
        if normalized == "severe":
            return Severity.HIGH
        if normalized == "moderate":
            return Severity.MODERATE
        return Severity.LOW

    def _map_cap_severity(self, value: str) -> Severity:
        normalized = value.strip().lower()
        if normalized == "extreme":
            return Severity.EXTREME
        if normalized == "severe":
            return Severity.HIGH
        if normalized == "moderate":
            return Severity.MODERATE
        return Severity.LOW

    def _parse_datetime(self, value: Any) -> datetime | None:
        if not value:
            return None
        if isinstance(value, datetime):
            return value
        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
