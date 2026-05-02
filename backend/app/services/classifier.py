from __future__ import annotations

from app.models.schemas import (
    AlertClassification,
    AlertLevel,
    CameraSignal,
    HouseholdState,
    MemberRole,
    MemberStatus,
    Severity,
    ThreatEvent,
)


def local_classify_alert(
    event: ThreatEvent,
    household: HouseholdState,
    camera_signal: CameraSignal | None,
    source_notes: list[str] | None = None,
) -> AlertClassification:
    score = 0
    notes = list(source_notes or [])

    if event.severity == Severity.EXTREME:
        score += 4
    elif event.severity == Severity.HIGH:
        score += 3
    elif event.severity == Severity.MODERATE:
        score += 2
    else:
        score += 1

    if camera_signal and camera_signal.occupancy_confirmed and camera_signal.confidence >= 0.75:
        score += 2
        notes.append("Prerecorded CCTV metadata confirms home occupancy.")

    if any(member.status == MemberStatus.NEEDS_HELP for member in household.members):
        score += 3
        notes.append("At least one family member is marked Needs Help.")

    if any(member.role == MemberRole.CHILD and member.status == MemberStatus.HOME for member in household.members):
        score += 2
        notes.append("A child is marked home during the alert.")

    if score >= 8 or event.severity == Severity.EXTREME:
        level = AlertLevel.LIFE_THREATENING
    elif score >= 6:
        level = AlertLevel.MAJOR
    elif score >= 3:
        level = AlertLevel.MODERATE
    else:
        level = AlertLevel.MINOR

    return AlertClassification(
        level=level,
        confidence=0.72,
        rationale=(
            f"Local fallback classified this as {level.value.replace('_', ' ')} from "
            f"{event.severity.value} source severity, household state, and camera context."
        ),
        classified_by="local_fallback",
        source_notes=notes,
    )
