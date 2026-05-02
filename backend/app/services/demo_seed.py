from __future__ import annotations

from datetime import timedelta

from app.models.schemas import (
    CalendarItem,
    Channel,
    HomeSignal,
    MemberLocation,
    MemberLocationSource,
    HouseholdMember,
    HouseholdState,
    MemberRole,
    MemberStatus,
    utc_now,
)
from app.repositories.store import SQLiteStore


def build_demo_household() -> HouseholdState:
    now = utc_now()
    return HouseholdState(
        members=[
            HouseholdMember(
                id="guardian_1",
                name="Alex Rivera",
                role=MemberRole.GUARDIAN,
                age_category="adult",
                status=MemberStatus.AWAY,
                priority=1,
                channels=[Channel.TELEGRAM, Channel.CALL, Channel.SMS, Channel.EMAIL],
                location=MemberLocation(
                    latitude=35.2828,
                    longitude=-120.6596,
                    accuracy_meters=35,
                    speed_mps=0.4,
                    label="Downtown San Luis Obispo",
                    source=MemberLocationSource.DEMO_SEED,
                    observed_at=now - timedelta(minutes=6),
                ),
            ),
            HouseholdMember(
                id="guardian_2",
                name="Jordan Lee",
                role=MemberRole.GUARDIAN,
                age_category="adult",
                status=MemberStatus.AWAY,
                priority=2,
                channels=[Channel.TELEGRAM, Channel.CALL, Channel.EMAIL, Channel.SMS],
                location=MemberLocation(
                    latitude=35.2937,
                    longitude=-120.67,
                    accuracy_meters=42,
                    speed_mps=7.2,
                    label="Foothill corridor",
                    source=MemberLocationSource.DEMO_SEED,
                    observed_at=now - timedelta(minutes=8),
                ),
            ),
            HouseholdMember(
                id="child_1",
                name="Maya Rivera",
                role=MemberRole.CHILD,
                age_category="child",
                status=MemberStatus.HOME,
                priority=3,
                channels=[],
                location=MemberLocation(
                    latitude=35.3009,
                    longitude=-120.6615,
                    accuracy_meters=18,
                    speed_mps=0.1,
                    label="Home near Cal Poly campus",
                    source=MemberLocationSource.DEMO_SEED,
                    observed_at=now - timedelta(minutes=4),
                ),
            ),
        ],
        home_signal=HomeSignal(
            label="Occupancy-confirmed home signal",
            occupancy_confirmed=True,
            observed_at=now - timedelta(minutes=4),
            confidence=0.92,
        ),
        calendar_items=[
            CalendarItem(
                title="Piano lesson pickup",
                starts_at=now + timedelta(minutes=45),
                location_label="Downtown San Luis Obispo",
                participants=["child_1", "guardian_1"],
            )
        ],
        updated_at=now,
    )


def ensure_demo_seed(store: SQLiteStore) -> HouseholdState:
    existing = store.get_household()
    if existing is not None and all(member.location is not None for member in existing.members):
        return existing
    household = build_demo_household()
    store.set_household(household)
    return household
