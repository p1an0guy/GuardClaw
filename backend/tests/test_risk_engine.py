from __future__ import annotations

from app.models.schemas import (
    AlertClassification,
    AlertLevel,
    Channel,
    HouseholdState,
    MemberStatus,
    Severity,
    ThreatEvent,
)
from app.services.demo_seed import build_demo_household
from app.services.risk_engine import build_action_plan


def _make_event() -> ThreatEvent:
    return ThreatEvent(
        event_type="weather_alert",
        title="Test alert",
        description="Test",
        severity=Severity.HIGH,
        location_label="Test",
        source_kind="nws",
        source_name="Test",
    )


def _make_classification(level: AlertLevel) -> AlertClassification:
    return AlertClassification(
        level=level,
        confidence=0.8,
        rationale="Test classification",
    )


def test_life_threatening_targets_all_members():
    household = build_demo_household()
    event = _make_event()
    plan = build_action_plan(event, household, _make_classification(AlertLevel.LIFE_THREATENING), None)
    targeted_ids = {intent.member_id for intent in plan.notification_intents}
    all_ids = {m.id for m in household.members}
    assert targeted_ids == all_ids


def test_major_targets_guardians_and_affected():
    household = build_demo_household()
    event = _make_event()
    plan = build_action_plan(event, household, _make_classification(AlertLevel.MAJOR), None)
    targeted_ids = {intent.member_id for intent in plan.notification_intents}
    # Should include guardians
    guardian_ids = {m.id for m in household.members if m.role.value == "guardian"}
    assert guardian_ids.issubset(targeted_ids)


def test_moderate_targets_guardians():
    household = build_demo_household()
    event = _make_event()
    plan = build_action_plan(event, household, _make_classification(AlertLevel.MODERATE), None)
    targeted_ids = {intent.member_id for intent in plan.notification_intents}
    guardian_ids = {m.id for m in household.members if m.role.value == "guardian"}
    assert targeted_ids == guardian_ids


def test_minor_targets_only_priority_1_guardian():
    household = build_demo_household()
    event = _make_event()
    plan = build_action_plan(event, household, _make_classification(AlertLevel.MINOR), None)
    assert len(plan.notification_intents) == 1
    assert plan.notification_intents[0].member_id == "guardian_1"


def test_commuting_member_routes_to_call():
    household = build_demo_household()
    # Make guardian_2 commuting (it has speed_mps=7.2 in demo seed but status is AWAY)
    for m in household.members:
        if m.id == "guardian_2":
            m.status = MemberStatus.COMMUTING
    event = _make_event()
    plan = build_action_plan(event, household, _make_classification(AlertLevel.LIFE_THREATENING), None)
    for intent in plan.notification_intents:
        if intent.member_id == "guardian_2":
            assert intent.channel == Channel.CALL
            break
    else:
        raise AssertionError("guardian_2 not found in notification intents")


def test_non_commuting_member_routes_to_telegram():
    household = build_demo_household()
    event = _make_event()
    plan = build_action_plan(event, household, _make_classification(AlertLevel.LIFE_THREATENING), None)
    for intent in plan.notification_intents:
        member = next(m for m in household.members if m.id == intent.member_id)
        if member.status != MemberStatus.COMMUTING:
            assert intent.channel == Channel.TELEGRAM
