from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Body, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.session import store
from app.models.schemas import (
    AcknowledgeRequest,
    AcknowledgeResponse,
    ActiveIncidentResponse,
    HouseholdState,
    SimulateEventRequest,
    TimelineEntry,
)
from app.services.alert_sources import AlertSourceService
from app.services.camera_signals import CameraSignalService
from app.services.classifier import local_classify_alert
from app.services.demo_seed import ensure_demo_seed
from app.services.hermes_adapter import HermesAdapter
from app.services.messaging import MessagingService
from app.services.notification_writer import write_notifications
from app.services.risk_engine import build_action_plan
from app.services.supabase_household import SupabaseHouseholdService


@asynccontextmanager
async def lifespan(_: FastAPI):
    store.initialize()
    ensure_demo_seed(store)
    yield


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, object]:
    return {"status": "ok", "demo_mode": settings.demo_mode}


@app.post("/api/simulate/event", response_model=ActiveIncidentResponse)
async def simulate_event(
    request: SimulateEventRequest | None = Body(default=None),
) -> ActiveIncidentResponse:
    payload = request or SimulateEventRequest()
    household = await SupabaseHouseholdService(settings).get_household()
    if household is None:
        household = store.get_household() or ensure_demo_seed(store)
    else:
        store.set_household(household)
    event = await AlertSourceService().create_event(payload)
    camera_signal = CameraSignalService(settings).create_signal(payload.include_camera, payload.camera_scenario)
    hermes = HermesAdapter(settings)
    classification, classifier_note = await hermes.classify_alert(event, household, camera_signal)
    if classification is None:
        classification = local_classify_alert(event, household, camera_signal, [classifier_note])

    plan = build_action_plan(event, household, classification, camera_signal)

    plan, hermes_note = await hermes.refine_action_plan_messages(event, household, plan)

    await write_notifications(settings, household, plan)

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


@app.get("/api/incidents/active", response_model=ActiveIncidentResponse)
async def get_active_incident() -> ActiveIncidentResponse:
    return store.get_active_incident()


@app.get("/api/household", response_model=HouseholdState)
async def get_household() -> HouseholdState:
    household = await SupabaseHouseholdService(settings).get_household()
    if household is not None:
        store.set_household(household)
        return household
    return store.get_household() or ensure_demo_seed(store)


@app.post("/api/actions/acknowledge", response_model=AcknowledgeResponse)
async def acknowledge_action(request: AcknowledgeRequest) -> AcknowledgeResponse:
    entry = store.acknowledge(request.target_id, request.acknowledged_by, request.note)
    return AcknowledgeResponse(acknowledged=True, timeline_entry=entry, demo_mode=True)


@app.get("/api/actions/timeline", response_model=list[TimelineEntry])
async def get_timeline() -> list[TimelineEntry]:
    return store.list_timeline()
