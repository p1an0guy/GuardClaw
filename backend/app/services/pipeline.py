from __future__ import annotations

from app.core.config import Settings
from app.models.schemas import (
    ActiveIncidentResponse,
    CameraSignal,
    HouseholdState,
    TimelineEntry,
    ThreatEvent,
)
from app.repositories.store import SQLiteStore
from app.services.camera_signals import CameraSignalService
from app.services.classifier import local_classify_alert
from app.services.hermes_adapter import HermesAdapter
from app.services.messaging import MessagingService
from app.services.risk_engine import build_action_plan, _members_in_radius
from app.services.supabase_household import SupabaseHouseholdService
from app.services.demo_seed import ensure_demo_seed


async def run_alert_pipeline(
    event: ThreatEvent,
    store: SQLiteStore,
    settings: Settings,
    include_camera: bool = False,
    camera_scenario: str = "front_walkway",
) -> ActiveIncidentResponse:
    household = await SupabaseHouseholdService(settings).get_household()
    if household is None:
        household = store.get_household() or ensure_demo_seed(store)
    else:
        store.set_household(household)
    camera_signal = CameraSignalService(settings).create_signal(include_camera, camera_scenario)
    hermes = HermesAdapter(settings)
    proximity_ids = _members_in_radius(household, event, settings.alert_radius_km)
    proximity_members = [{"id": m.id, "name": m.name} for m in household.members if m.id in proximity_ids]
    classification, classifier_note = await hermes.classify_alert(event, household, camera_signal, proximity_members)
    if classification is None:
        classification = local_classify_alert(event, household, camera_signal, [classifier_note])

    plan = build_action_plan(event, household, classification, camera_signal, radius_km=settings.alert_radius_km)

    plan, hermes_note = await hermes.refine_action_plan_messages(event, household, plan, proximity_members)

    store.clear_timeline()
    store.add_timeline(
        TimelineEntry(
            incident_id=event.id,
            kind="incident_created",
            title="Simulated incident created",
            detail=f"{event.title} was ingested from {event.source_name}.",
            metadata={
                "source": event.source_kind.value,
                "is_live": event.is_live,
                "is_simulated": event.is_simulated,
            },
        )
    )
    if camera_signal is not None:
        store.add_timeline(
            TimelineEntry(
                incident_id=event.id,
                kind="camera_signal_ingested",
                title=f"{camera_signal.label} attached",
                detail=camera_signal.summary,
                metadata=camera_signal.model_dump(mode="json"),
            )
        )
    store.add_timeline(
        TimelineEntry(
            incident_id=event.id,
            kind="alert_classified",
            title=f"Alert classified as {classification.level.value.replace('_', ' ')}",
            detail=classification.rationale,
            metadata={
                **classification.model_dump(mode="json"),
                "classifier_note": classifier_note,
            },
        )
    )
    store.add_timeline(
        TimelineEntry(
            incident_id=event.id,
            kind="plan_created",
            title="Action plan generated",
            detail=plan.rationale,
            metadata={"generated_by": plan.generated_by, "hermes_note": hermes_note},
        )
    )
    webhook_ok, webhook_note = await hermes.send_family_alert_triage(event, household, proximity_ids)
    store.add_timeline(
        TimelineEntry(
            incident_id=event.id,
            kind="hermes_webhook_sent" if webhook_ok else "hermes_webhook_skipped",
            title="Hermes webhook dispatched" if webhook_ok else "Hermes webhook skipped",
            detail=webhook_note,
            metadata={"proximity_member_count": len(proximity_ids)},
        )
    )
    for action in plan.recommended_actions:
        store.add_timeline(
            TimelineEntry(
                id=action.id,
                incident_id=event.id,
                kind="recommended_action",
                title=action.label,
                detail=action.detail,
                metadata={"priority": action.priority},
            )
        )

    sent_messages = await MessagingService(store, hermes).send_all(plan.outbound_messages)
    plan = plan.model_copy(update={"outbound_messages": sent_messages})
    store.set_active_incident(event, plan)
    return ActiveIncidentResponse(
        incident=event,
        action_plan=plan,
        camera_signal=camera_signal,
        classification=classification,
        demo_mode=True,
    )
