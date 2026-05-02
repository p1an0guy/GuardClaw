from __future__ import annotations

from math import radians, cos, sin, asin, sqrt

from app.models.schemas import (
    ActionPlan,
    AffectedPerson,
    AlertClassification,
    AlertLevel,
    CameraSignal,
    Channel,
    HouseholdMember,
    HouseholdState,
    MemberRole,
    MemberStatus,
    NotificationIntent,
    NotifyTarget,
    OutboundMessage,
    RecommendedAction,
    ThreatEvent,
)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * r * asin(sqrt(a))


def _members_in_radius(household: HouseholdState, event: ThreatEvent, radius_km: float) -> list[str]:
    if event.latitude is None or event.longitude is None:
        return []
    result: list[str] = []
    for member in household.members:
        if member.location is None:
            continue
        dist = _haversine_km(member.location.latitude, member.location.longitude, event.latitude, event.longitude)
        if dist <= radius_km:
            result.append(member.id)
    return result


def build_action_plan(
    event: ThreatEvent,
    household: HouseholdState,
    classification: AlertClassification,
    camera_signal: CameraSignal | None,
    radius_km: float = 16.0,
) -> ActionPlan:
    proximity_ids = _members_in_radius(household, event, radius_km)
    affected_people = _affected_people(household, proximity_ids, event)
    targets = _route_targets(household, classification.level, proximity_ids)
    notification_intents = [
        NotificationIntent(
            member_id=member.id,
            member_name=member.name,
            channel=_channel_for(member),
            reason=_routing_reason(member, classification.level),
            movement_state=member.status,
            priority=index + 1,
        )
        for index, member in enumerate(targets)
    ]
    notify_order = [
        NotifyTarget(
            member_id=intent.member_id,
            name=intent.member_name,
            order=index + 1,
            channels=[intent.channel],
            reason=intent.reason,
        )
        for index, intent in enumerate(notification_intents)
    ]

    camera_text = (
        f" CCTV context: {camera_signal.summary} ({camera_signal.confidence:.0%} confidence)."
        if camera_signal
        else " No CCTV context was included."
    )
    routing_text = _routing_summary(classification.level)
    rationale = (
        f"Hermes classified this alert as {classification.level.value.replace('_', ' ')}. "
        f"{classification.rationale} {routing_text}{camera_text}"
    )

    recommended_actions = [
        RecommendedAction(
            label="Route household alert",
            detail=routing_text,
            priority=1,
        ),
        RecommendedAction(
            label="Confirm highest-risk members",
            detail="Check members marked home, commuting, or Needs Help before escalating further.",
            priority=2,
        ),
        RecommendedAction(
            label="Keep source labels explicit",
            detail="Show whether the trigger came from live NWS, archived IPAWS, replay data, or CCTV metadata.",
            priority=3,
        ),
    ]

    plan = ActionPlan(
        incident_id=event.id,
        classification=classification,
        camera_signal=camera_signal,
        affected_people=affected_people,
        notify_order=notify_order,
        notification_intents=notification_intents,
        recommended_actions=recommended_actions,
        rationale=rationale,
    )

    return plan.model_copy(update={"outbound_messages": _build_message_drafts(event, plan)})


def _affected_people(household: HouseholdState, proximity_member_ids: list[str], event: ThreatEvent) -> list[AffectedPerson]:
    affected: list[AffectedPerson] = []
    for member in sorted(household.members, key=lambda item: item.priority):
        if member.status == MemberStatus.NEEDS_HELP:
            affected.append(
                AffectedPerson(
                    member_id=member.id,
                    name=member.name,
                    risk_level="urgent",
                    reason="Member is marked Needs Help in the mobile app.",
                )
            )
        elif member.role == MemberRole.CHILD and member.status == MemberStatus.HOME:
            affected.append(
                AffectedPerson(
                    member_id=member.id,
                    name=member.name,
                    risk_level="home_occupant",
                    reason="Child is marked home while the alert is active.",
                )
            )
        elif member.status == MemberStatus.COMMUTING:
            affected.append(
                AffectedPerson(
                    member_id=member.id,
                    name=member.name,
                    risk_level="movement",
                    reason="Member appears to be commuting or moving based on phone status/location.",
                )
            )
    already_ids = {a.member_id for a in affected}
    for member in sorted(household.members, key=lambda item: item.priority):
        if member.id in proximity_member_ids and member.id not in already_ids and member.location is not None:
            dist = _haversine_km(
                member.location.latitude, member.location.longitude,
                event.latitude, event.longitude,  # type: ignore[arg-type]
            )
            affected.append(
                AffectedPerson(
                    member_id=member.id,
                    name=member.name,
                    risk_level="proximity",
                    reason=f"Member is within {dist:.1f} km of the alert area.",
                )
            )
    return affected


def _route_targets(household: HouseholdState, level: AlertLevel, proximity_ids: list[str]) -> list[HouseholdMember]:
    members = sorted(household.members, key=lambda item: item.priority)
    guardians = [member for member in members if member.role == MemberRole.GUARDIAN]
    directly_affected = [
        member
        for member in members
        if member.status in {MemberStatus.HOME, MemberStatus.COMMUTING, MemberStatus.NEEDS_HELP}
        or member.role == MemberRole.CHILD
    ]
    proximity_members = [member for member in members if member.id in proximity_ids]

    if level == AlertLevel.LIFE_THREATENING:
        return members
    if level == AlertLevel.MAJOR:
        return _dedupe_members([*guardians, *directly_affected, *proximity_members])
    if level == AlertLevel.MODERATE:
        return guardians
    return guardians[:1]


def _dedupe_members(members: list[HouseholdMember]) -> list[HouseholdMember]:
    seen: set[str] = set()
    deduped: list[HouseholdMember] = []
    for member in members:
        if member.id in seen:
            continue
        seen.add(member.id)
        deduped.append(member)
    return deduped


def _channel_for(member: HouseholdMember) -> Channel:
    if member.status == MemberStatus.COMMUTING:
        return Channel.CALL
    return Channel.TELEGRAM


def _routing_reason(member: HouseholdMember, level: AlertLevel) -> str:
    channel = "call" if member.status == MemberStatus.COMMUTING else "Telegram"
    return (
        f"{level.value.replace('_', ' ').title()} alert routed to {member.name} by {channel} "
        f"because their current state is {member.status.value.replace('_', ' ')}."
    )


def _routing_summary(level: AlertLevel) -> str:
    if level == AlertLevel.LIFE_THREATENING:
        return "Life-threatening alerts immediately notify every household member."
    if level == AlertLevel.MAJOR:
        return "Major alerts notify all guardians plus directly affected members."
    if level == AlertLevel.MODERATE:
        return "Moderate alerts notify guardians and parents."
    return "Minor alerts notify only the primary guardian to avoid unnecessary household-wide alarm."


def _build_message_drafts(event: ThreatEvent, plan: ActionPlan) -> list[OutboundMessage]:
    messages: list[OutboundMessage] = []
    for intent in plan.notification_intents:
        action = plan.recommended_actions[0].detail if plan.recommended_actions else "Review GuardClaw timeline."
        messages.append(
            OutboundMessage(
                incident_id=event.id,
                recipient_id=intent.member_id,
                recipient_name=intent.member_name,
                channel=intent.channel,
                subject=f"GuardClaw {plan.classification.level.value.replace('_', ' ')} alert: {event.title}"
                if plan.classification
                else f"GuardClaw alert: {event.title}",
                body=(
                    f"GuardClaw alert for {intent.member_name}: {event.title} near {event.location_label}. "
                    f"{plan.rationale} Route: {intent.reason} Next step: {action}"
                ),
            )
        )
    return messages
