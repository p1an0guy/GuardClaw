from __future__ import annotations

import httpx

from app.core.config import Settings
from app.models.schemas import ActionPlan, HouseholdMember, HouseholdState, MemberRole, MemberStatus


async def write_notifications(
    settings: Settings,
    household: HouseholdState,
    plan: ActionPlan,
) -> None:
    """Write notification rows to Supabase after an action plan is built."""
    if not (settings.supabase_url and settings.supabase_key and settings.supabase_family_id):
        return

    rows: list[dict] = []

    # Check if any child needs help — guardian-only notification
    for member in household.members:
        if member.role == MemberRole.CHILD and member.status == MemberStatus.NEEDS_HELP:
            lat = member.location.latitude if member.location else None
            lng = member.location.longitude if member.location else None
            rows.append({
                "family_id": settings.supabase_family_id,
                "target_role": "guardian",
                "title": f"{member.name} needs help",
                "body": f"{member.name} has triggered a help alert.",
                "lat": lat,
                "lng": lng,
            })

    # General alert notification for all members
    if plan.classification:
        level = plan.classification.level.value.replace("_", " ").title()
        rows.append({
            "family_id": settings.supabase_family_id,
            "target_role": "all",
            "title": f"{level} Alert",
            "body": plan.rationale[:300] if plan.rationale else "A new alert has been issued.",
        })

    if not rows:
        return

    base = settings.supabase_url.rstrip("/")
    headers = {
        "apikey": settings.supabase_key,
        "Authorization": f"Bearer {settings.supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    try:
        async with httpx.AsyncClient(timeout=5, headers=headers) as client:
            await client.post(f"{base}/rest/v1/notifications", json=rows)
    except Exception:
        pass  # Best-effort; don't break the pipeline
