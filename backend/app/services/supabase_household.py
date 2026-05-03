from __future__ import annotations

from datetime import datetime, timezone
from math import asin, cos, radians, sin, sqrt
from typing import Any

import httpx

from app.core.config import Settings
from app.models.schemas import (
    Channel,
    HomeSignal,
    HouseholdMember,
    HouseholdState,
    MemberLocation,
    MemberLocationSource,
    MemberRole,
    MemberStatus,
    SavedLocation,
)


CAL_POLY_HOME: tuple[float, float] = (35.3009, -120.6615)


class SupabaseHouseholdService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def get_household(self) -> HouseholdState | None:
        if not (self.settings.supabase_url and self.settings.supabase_key and self.settings.supabase_family_id):
            return None

        headers = {
            "apikey": self.settings.supabase_key,
            "Authorization": f"Bearer {self.settings.supabase_key}",
        }
        base = self.settings.supabase_url.rstrip("/")

        try:
            async with httpx.AsyncClient(timeout=8, headers=headers) as client:
                members_rows = await self._fetch_members(client, base)
                if not members_rows:
                    return None
                location_rows = await self._fetch_optional(client, base, "member_locations")
                member_ids = [str(r["id"]) for r in members_rows if r.get("id")]
                contact_rows = await self._fetch_contacts(client, base, member_ids)
        except Exception:
            return None

        latest_locations = self._latest_by_member(location_rows)
        contacts = {str(row.get("member_id")): row for row in contact_rows if row.get("member_id")}
        members = [
            self._build_member(row, latest_locations.get(str(row.get("id"))), contacts.get(str(row.get("id"))))
            for row in members_rows
        ]

        return HouseholdState(
            members=members,
            home_signal=HomeSignal(
                label="Supabase phone-tracked household signal",
                occupancy_confirmed=any(member.status == MemberStatus.HOME for member in members),
                confidence=0.84,
            ),
            updated_at=datetime.now(timezone.utc),
        )

    async def get_saved_locations(self) -> list[SavedLocation]:
        if not (self.settings.supabase_url and self.settings.supabase_key and self.settings.supabase_family_id):
            return []
        headers = {
            "apikey": self.settings.supabase_key,
            "Authorization": f"Bearer {self.settings.supabase_key}",
        }
        base = self.settings.supabase_url.rstrip("/")
        try:
            async with httpx.AsyncClient(timeout=8, headers=headers) as client:
                response = await client.get(
                    f"{base}/rest/v1/saved_locations",
                    params={
                        "family_id": f"eq.{self.settings.supabase_family_id}",
                        "select": "*",
                    },
                )
                if response.status_code >= 400:
                    return []
                data = response.json()
                if not isinstance(data, list):
                    return []
                return [
                    SavedLocation(
                        id=str(row.get("id", "")),
                        family_id=str(row.get("family_id", "")),
                        member_id=str(row.get("member_id", "")),
                        label=str(row.get("label", "")),
                        lat=float(row.get("lat", 0)),
                        lng=float(row.get("lng", 0)),
                        created_at=str(row.get("created_at", "")),
                    )
                    for row in data
                ]
        except Exception:
            return []

    async def _fetch_members(self, client: httpx.AsyncClient, base: str) -> list[dict[str, Any]]:
        response = await client.get(
            f"{base}/rest/v1/members",
            params={
                "family_id": f"eq.{self.settings.supabase_family_id}",
                "select": "*",
                "order": "updated_at.desc",
            },
        )
        response.raise_for_status()
        data = response.json()
        return data if isinstance(data, list) else []

    async def _fetch_optional(self, client: httpx.AsyncClient, base: str, table: str) -> list[dict[str, Any]]:
        response = await client.get(
            f"{base}/rest/v1/{table}",
            params={
                "family_id": f"eq.{self.settings.supabase_family_id}",
                "select": "*",
                "order": "observed_at.desc",
            },
        )
        if response.status_code >= 400:
            return []
        data = response.json()
        return data if isinstance(data, list) else []

    async def _fetch_contacts(self, client: httpx.AsyncClient, base: str, member_ids: list[str]) -> list[dict[str, Any]]:
        if not member_ids:
            return []
        response = await client.get(
            f"{base}/rest/v1/member_contacts",
            params={"member_id": f"in.({','.join(member_ids)})", "select": "*"},
        )
        if response.status_code >= 400:
            return []
        data = response.json()
        return data if isinstance(data, list) else []

    def _latest_by_member(self, rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
        latest: dict[str, dict[str, Any]] = {}
        for row in rows:
            member_id = str(row.get("member_id") or "")
            if member_id and member_id not in latest:
                latest[member_id] = row
        return latest

    def _build_member(
        self,
        row: dict[str, Any],
        latest_location: dict[str, Any] | None,
        contact: dict[str, Any] | None,
    ) -> HouseholdMember:
        member_id = str(row.get("id"))
        mobile_status = str(row.get("status") or "Offline")
        lat = self._float((latest_location or row).get("lat"))
        lng = self._float((latest_location or row).get("lng"))
        speed_mps = self._float((latest_location or {}).get("speed_mps"))
        status = self._map_status(mobile_status, lat, lng, speed_mps, contact)
        role = MemberRole.GUARDIAN
        row_role = str(row.get("role") or "").lower()
        contact_role = str((contact or {}).get("role") or "").lower()
        if row_role == "child" or contact_role == "child":
            role = MemberRole.CHILD

        observed_raw = (latest_location or row).get("observed_at") or row.get("updated_at")
        observed_at = self._parse_datetime(observed_raw) or datetime.now(timezone.utc)
        priority = int((contact or {}).get("priority") or row.get("priority") or (2 if role == MemberRole.GUARDIAN else 4))

        return HouseholdMember(
            id=member_id,
            name=str(row.get("name") or "Family member"),
            role=role,
            age_category="child" if role == MemberRole.CHILD else "adult",
            status=status,
            priority=priority,
            channels=[Channel.TELEGRAM, Channel.CALL],
            location=MemberLocation(
                latitude=lat or CAL_POLY_HOME[0],
                longitude=lng or CAL_POLY_HOME[1],
                accuracy_meters=self._float((latest_location or {}).get("accuracy_meters")),
                speed_mps=speed_mps,
                label="Supabase phone location",
                source=MemberLocationSource.MOBILE_APP,
                observed_at=observed_at,
            ),
            mobile_status=mobile_status,
            phone_e164=(str(contact.get("phone_e164")) if contact and contact.get("phone_e164") else None),
            telegram_chat_id=(
                str(contact.get("telegram_chat_id")) if contact and contact.get("telegram_chat_id") else None
            ),
        )

    def _map_status(
        self,
        mobile_status: str,
        lat: float | None,
        lng: float | None,
        speed_mps: float | None,
        contact: dict[str, Any] | None,
    ) -> MemberStatus:
        normalized = mobile_status.strip().lower()
        if normalized == "needs help":
            return MemberStatus.NEEDS_HELP
        if normalized == "offline":
            return MemberStatus.OFFLINE
        if speed_mps is not None and speed_mps >= 2.2:
            return MemberStatus.COMMUTING
        if normalized == "moving":
            return MemberStatus.COMMUTING
        if normalized == "home":
            return MemberStatus.HOME

        if lat is not None and lng is not None and contact:
            home = (self._float(contact.get("home_lat")), self._float(contact.get("home_lng")))
            work = (self._float(contact.get("work_lat")), self._float(contact.get("work_lng")))
            if home[0] is not None and home[1] is not None and self._distance_meters((lat, lng), home) < 250:
                return MemberStatus.HOME
            if work[0] is not None and work[1] is not None and self._distance_meters((lat, lng), work) < 300:
                return MemberStatus.WORK

        return MemberStatus.AWAY

    def _distance_meters(self, point_a: tuple[float, float], point_b: tuple[float | None, float | None]) -> float:
        if point_b[0] is None or point_b[1] is None:
            return float("inf")
        lat1, lng1 = point_a
        lat2, lng2 = point_b
        radius = 6_371_000
        dlat = radians(lat2 - lat1)
        dlng = radians(lng2 - lng1)
        a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
        return 2 * radius * asin(sqrt(a))

    def _float(self, value: Any) -> float | None:
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _parse_datetime(self, value: Any) -> datetime | None:
        if not value:
            return None
        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
