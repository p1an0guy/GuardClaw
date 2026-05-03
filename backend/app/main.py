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
    Camera,
    CameraAlertSchedule,
    CreateCameraRequest,
    CreateScheduleRequest,
    HouseholdState,
    SavedLocation,
    SimulateEventRequest,
    TimelineEntry,
    UpdateCameraRequest,
)
from app.services.alert_sources import AlertSourceService
from app.services.camera_service import CameraService
from app.services.cctv_monitor import CCTVMonitor
from app.services.demo_seed import ensure_demo_seed
from app.services.hermes_adapter import HermesAdapter
from app.services.messaging import MessagingService
from app.services.notification_writer import write_notifications
from app.services.risk_engine import build_action_plan
from app.services.nws_poller import NWSPoller
from app.services.pipeline import run_alert_pipeline
from app.services.supabase_audit import SupabaseAuditService
from app.services.supabase_household import SupabaseHouseholdService

audit_service = SupabaseAuditService(settings)


@asynccontextmanager
async def lifespan(_: FastAPI):
    logging.basicConfig(level=logging.INFO)
    store.initialize()
    ensure_demo_seed(store)
    await audit_service.bootstrap()
    poller_task = asyncio.create_task(NWSPoller().run(store, settings))
    cctv_monitor = CCTVMonitor(settings) if settings.cctv_enabled else None
    if cctv_monitor:
        await cctv_monitor.start()
    yield
    if cctv_monitor:
        await cctv_monitor.stop()
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
    return await audit_service.list_entries()


@app.get("/api/saved-locations", response_model=list[SavedLocation])
async def get_saved_locations() -> list[SavedLocation]:
    return await SupabaseHouseholdService(settings).get_saved_locations()


@app.get("/api/cameras", response_model=list[Camera])
async def list_cameras() -> list[Camera]:
    return await CameraService(settings).list_cameras()


@app.get("/api/cameras/{camera_id}", response_model=Camera)
async def get_camera(camera_id: str) -> Camera:
    from fastapi import HTTPException
    result = await CameraService(settings).get_camera(camera_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    return result


@app.post("/api/cameras", response_model=Camera, status_code=201)
async def create_camera(request: CreateCameraRequest) -> Camera:
    return await CameraService(settings).create_camera(
        request.label, request.location_label, request.stream_url
    )


@app.patch("/api/cameras/{camera_id}", response_model=Camera)
async def update_camera(camera_id: str, request: UpdateCameraRequest) -> Camera:
    return await CameraService(settings).update_camera(
        camera_id,
        label=request.label,
        location_label=request.location_label,
        stream_url=request.stream_url,
        enabled=request.enabled,
    )


@app.delete("/api/cameras/{camera_id}", status_code=204)
async def delete_camera(camera_id: str) -> None:
    await CameraService(settings).delete_camera(camera_id)


@app.get("/api/cameras/{camera_id}/schedules", response_model=list[CameraAlertSchedule])
async def list_schedules(camera_id: str) -> list[CameraAlertSchedule]:
    return await CameraService(settings).list_schedules(camera_id)


@app.post("/api/cameras/{camera_id}/schedules", response_model=CameraAlertSchedule, status_code=201)
async def create_schedule(camera_id: str, request: CreateScheduleRequest) -> CameraAlertSchedule:
    return await CameraService(settings).create_schedule(
        camera_id, request.day_of_week, request.start_time, request.end_time
    )


@app.delete("/api/cameras/{camera_id}/schedules/{schedule_id}", status_code=204)
async def delete_schedule(camera_id: str, schedule_id: str) -> None:
    await CameraService(settings).delete_schedule(schedule_id)


@app.post("/api/cameras/{camera_id}/simulate-detection")
async def simulate_detection(camera_id: str) -> dict[str, object]:
    """Simulate a person detection event on a camera with clip extraction."""
    import asyncio
    import os
    import time
    from app.services.cctv_alert_pipeline import CCTVAlertPipeline

    cam = await CameraService(settings).get_camera(camera_id)
    if cam is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Camera not found")

    pipeline = CCTVAlertPipeline(settings)
    timestamp = time.time()
    confidence = 0.92

    # Extract a 20-30s clip directly from the video file using ffmpeg
    clip_url = None
    source = cam.get("stream_url") or ""
    if source and not source.startswith(("rtsp://", "http://", "https://", "/")):
        source = os.path.join(settings.cctv_video_base_path, source)

    if source and os.path.exists(source):
        clip_url = await pipeline._extract_and_upload_clip(source, camera_id, timestamp)

    await pipeline._send_webhook(
        camera_id=camera_id,
        camera_label=cam["label"],
        location_label=cam["location_label"],
        timestamp=timestamp,
        confidence=confidence,
        clip_url=clip_url,
    )
    await pipeline._write_notification(
        camera_label=cam["label"],
        location_label=cam["location_label"],
        confidence=confidence,
        clip_url=clip_url,
    )

    return {
        "status": "alert_sent",
        "camera_id": camera_id,
        "camera_label": cam["label"],
        "confidence": confidence,
        "clip_url": clip_url,
        "message": f"Simulated person detection on {cam['label']} — clip extracted, webhook + notification dispatched.",
    }
