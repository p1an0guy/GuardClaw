from __future__ import annotations

import httpx
from app.core.config import Settings
from app.models.schemas import EmergencyContact, new_id, utc_now


class EmergencyContactService:
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

    async def list_contacts(self) -> list[EmergencyContact]:
        if not self.settings.supabase_url or not self.settings.supabase_key:
            return []
        async with httpx.AsyncClient(timeout=8, headers=self._headers()) as client:
            resp = await client.get(
                f"{self._base()}/rest/v1/emergency_contacts",
                params={"family_id": f"eq.{self.settings.supabase_family_id}", "select": "*", "order": "created_at.asc"},
            )
            if resp.status_code >= 400:
                return []
            return [EmergencyContact(**row) for row in resp.json()]

    async def create_contact(self, name: str, phone_e164: str | None, email: str | None, relationship: str) -> EmergencyContact:
        contact = EmergencyContact(
            id=new_id("ec"),
            family_id=self.settings.supabase_family_id,
            name=name,
            phone_e164=phone_e164,
            email=email,
            relationship=relationship,
            created_at=utc_now(),
        )
        async with httpx.AsyncClient(timeout=8, headers={**self._headers(), "Prefer": "return=representation"}) as client:
            resp = await client.post(
                f"{self._base()}/rest/v1/emergency_contacts",
                json={
                    "id": contact.id,
                    "family_id": contact.family_id,
                    "name": contact.name,
                    "phone_e164": contact.phone_e164,
                    "email": contact.email,
                    "relationship": contact.relationship,
                    "created_at": contact.created_at.isoformat(),
                },
            )
            resp.raise_for_status()
        return contact

    async def delete_contact(self, contact_id: str) -> None:
        async with httpx.AsyncClient(timeout=8, headers=self._headers()) as client:
            await client.delete(
                f"{self._base()}/rest/v1/emergency_contacts",
                params={"id": f"eq.{contact_id}", "family_id": f"eq.{self.settings.supabase_family_id}"},
            )
