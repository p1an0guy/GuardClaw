from __future__ import annotations

from app.models.schemas import MemberStatus
from app.services.supabase_household import SupabaseHouseholdService
from app.core.config import Settings


def test_missing_supabase_config_returns_none():
    """When Supabase URL/key/family_id are empty, get_household returns None."""
    import asyncio
    settings = Settings()
    # Default settings have empty supabase credentials
    object.__setattr__(settings, 'supabase_url', '')
    object.__setattr__(settings, 'supabase_key', '')
    object.__setattr__(settings, 'supabase_family_id', '')
    service = SupabaseHouseholdService(settings)
    result = asyncio.run(service.get_household())
    assert result is None


def test_status_mapping_preserves_mobile_statuses():
    """The _map_status method correctly maps mobile status strings."""
    from app.core.config import Settings
    settings = Settings()
    service = SupabaseHouseholdService(settings)

    assert service._map_status("Needs Help", None, None, None, None) == MemberStatus.NEEDS_HELP
    assert service._map_status("Offline", None, None, None, None) == MemberStatus.OFFLINE
    assert service._map_status("Moving", None, None, None, None) == MemberStatus.COMMUTING
    assert service._map_status("Home", None, None, None, None) == MemberStatus.HOME
    assert service._map_status("Safe", None, None, None, None) == MemberStatus.AWAY
