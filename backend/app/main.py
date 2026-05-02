from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import Body, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.session import store
from app.models.schemas import (
    AcknowledgeRequest,
    AcknowledgeResponse,
    ActiveIncidentResponse,
    AlertAuditEntry,
    AlertAuditEntry,
    HouseholdState,
    SimulateEventRequest,
    TimelineEntry,
)
from app.services.alert_sources import AlertSourceService
from app.services.demo_seed import ensure_demo_seed
from app.services.hermes_adapter import HermesAdapter
from app.services.messaging import MessagingService
from app.services.notification_writer import write_notifications
from app.services.risk_engine import build_action_plan
from app.services.nws_poller import NWSPoller
from app.services.pipeline import run_alert_pipeline
from app.services.supabase_household import SupabaseHouseholdService


@asynccontextmanager
async def lifespan(_: FastAPI):
    logging.basicConfig(level=logging.INFO)
    store.initialize()
    ensure_demo_seed(store)
    poller_task = asyncio.create_task(NWSPoller().run(store, settings))
    poller_task = asyncio.create_task(NWSPoller().run(store, settings))
    yield
    poller_task.cancel()
    poller_task.cancel()


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
    event = await AlertSourceService().create_event(payload)
    return await run_alert_pipeline(
        event,
        store,
        settings,
        include_camera=payload.include_camera,
        camera_scenario=payload.camera_scenario,
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


@app.get("/api/alerts/audit-log", response_model=list[AlertAuditEntry])
async def get_audit_log() -> list[AlertAuditEntry]:
    return store.list_audit_log()
