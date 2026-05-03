from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field, HttpUrl


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


class Channel(str, Enum):
    TELEGRAM = "telegram"
    CALL = "call"
    EMAIL = "email"
    SMS = "sms"
    DISCORD = "discord"


class MemberRole(str, Enum):
    GUARDIAN = "guardian"
    CHILD = "child"


class MemberStatus(str, Enum):
    HOME = "home"
    AWAY = "away"
    WORK = "work"
    COMMUTING = "commuting"
    NEEDS_HELP = "needs_help"
    OFFLINE = "offline"


class MemberLocationSource(str, Enum):
    DEMO_SEED = "demo_seed"
    MOBILE_APP = "mobile_app"
    MANUAL = "manual"


class SourceKind(str, Enum):
    NWS = "nws"
    IPAWS = "ipaws"
    SLO_COUNTY = "slo_county"
    CAL_POLY = "cal_poly"
    CCTV = "cctv"
    USGS = "usgs"


class Severity(str, Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    EXTREME = "extreme"


class AlertLevel(str, Enum):
    MINOR = "minor"
    MODERATE = "moderate"
    MAJOR = "major"
    LIFE_THREATENING = "life_threatening"


class OutboundStatus(str, Enum):
    DRAFT = "draft"
    SENT_STUB = "sent_stub"
    SENT_VIA_HERMES = "sent_via_hermes"
    FAILED = "failed"


class HomeSignal(BaseModel):
    label: str
    occupancy_confirmed: bool
    observed_at: datetime = Field(default_factory=utc_now)
    confidence: float = Field(ge=0, le=1)


class CameraSignal(BaseModel):
    id: str = Field(default_factory=lambda: new_id("camera"))
    label: str
    clip_url: str
    source: str = "prerecorded_demo"
    occupancy_confirmed: bool
    confidence: float = Field(ge=0, le=1)
    observed_at: datetime = Field(default_factory=utc_now)
    summary: str


class CalendarItem(BaseModel):
    id: str = Field(default_factory=lambda: new_id("calendar"))
    title: str
    starts_at: datetime
    location_label: str
    participants: list[str] = Field(default_factory=list)


class ThreatEvent(BaseModel):
    id: str = Field(default_factory=lambda: new_id("event"))
    event_type: str
    title: str
    description: str
    severity: Severity
    location_label: str
    issued_at: datetime = Field(default_factory=utc_now)
    expires_at: datetime | None = None
    source_kind: SourceKind
    source_name: str
    source_url: HttpUrl | None = None
    latitude: float | None = None
    longitude: float | None = None
    is_live: bool = False
    is_simulated: bool = True
    demo_mode: bool = True
    raw: dict[str, Any] = Field(default_factory=dict)


class MemberLocation(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy_meters: float | None = Field(default=None, ge=0)
    speed_mps: float | None = Field(default=None, ge=0)
    label: str
    source: MemberLocationSource = MemberLocationSource.DEMO_SEED
    observed_at: datetime = Field(default_factory=utc_now)


class HouseholdMember(BaseModel):
    id: str
    name: str
    role: MemberRole
    age_category: str
    status: MemberStatus
    priority: int = Field(ge=1)
    channels: list[Channel] = Field(default_factory=list)
    location: MemberLocation | None = None
    mobile_status: str | None = None
    phone_e164: str | None = None
    telegram_chat_id: str | None = None


class HouseholdState(BaseModel):
    id: str = "demo-household"
    members: list[HouseholdMember]
    home_signal: HomeSignal
    calendar_items: list[CalendarItem] = Field(default_factory=list)
    demo_mode: bool = True
    updated_at: datetime = Field(default_factory=utc_now)


class AffectedPerson(BaseModel):
    member_id: str
    name: str
    risk_level: str
    reason: str


class NotifyTarget(BaseModel):
    member_id: str
    name: str
    order: int
    channels: list[Channel]
    reason: str


class RecommendedAction(BaseModel):
    id: str = Field(default_factory=lambda: new_id("action"))
    label: str
    detail: str
    priority: int = Field(ge=1)


class AlertClassification(BaseModel):
    level: AlertLevel
    confidence: float = Field(ge=0, le=1)
    rationale: str
    classified_by: str = "local_fallback"
    source_notes: list[str] = Field(default_factory=list)


class NotificationIntent(BaseModel):
    id: str = Field(default_factory=lambda: new_id("intent"))
    member_id: str
    member_name: str
    channel: Channel
    reason: str
    movement_state: MemberStatus
    priority: int = Field(ge=1)


class OutboundMessage(BaseModel):
    id: str = Field(default_factory=lambda: new_id("message"))
    incident_id: str
    recipient_id: str
    recipient_name: str
    channel: Channel
    status: OutboundStatus = OutboundStatus.DRAFT
    subject: str
    body: str
    created_at: datetime = Field(default_factory=utc_now)
    demo_mode: bool = True
    generated_by: str = "local"


class ActionPlan(BaseModel):
    id: str = Field(default_factory=lambda: new_id("plan"))
    incident_id: str
    classification: AlertClassification | None = None
    camera_signal: CameraSignal | None = None
    affected_people: list[AffectedPerson]
    notify_order: list[NotifyTarget]
    notification_intents: list[NotificationIntent] = Field(default_factory=list)
    recommended_actions: list[RecommendedAction]
    rationale: str
    outbound_messages: list[OutboundMessage] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)
    demo_mode: bool = True
    generated_by: str = "risk_engine"


class TimelineEntry(BaseModel):
    id: str = Field(default_factory=lambda: new_id("timeline"))
    incident_id: str | None = None
    kind: str
    title: str
    detail: str
    actor: str = "guardclaw"
    created_at: datetime = Field(default_factory=utc_now)
    acknowledged_at: datetime | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    demo_mode: bool = True


class SimulateEventRequest(BaseModel):
    source: SourceKind = SourceKind.NWS
    live: bool = False
    location_label: str = "San Luis Obispo, CA"
    include_camera: bool = True
    camera_scenario: str = "front_walkway"


class ActiveIncidentResponse(BaseModel):
    incident: ThreatEvent | None = None
    action_plan: ActionPlan | None = None
    camera_signal: CameraSignal | None = None
    classification: AlertClassification | None = None
    summary: str | None = None
    demo_mode: bool = True


class AcknowledgeRequest(BaseModel):
    target_id: str
    acknowledged_by: str = "demo-guardian"
    note: str | None = None


class AcknowledgeResponse(BaseModel):
    acknowledged: bool
    timeline_entry: TimelineEntry
    demo_mode: bool = True


class AlertAuditEntry(BaseModel):
    id: str = Field(default_factory=lambda: new_id("audit"))
    source_kind: SourceKind
    source_id: str
    event_type: str
    severity: Severity
    title: str
    ingested_at: datetime = Field(default_factory=utc_now)
    pipeline_triggered: bool = False
    raw: dict[str, Any] = Field(default_factory=dict)


class Camera(BaseModel):
    id: str
    family_id: str
    label: str
    location_label: str
    stream_url: str | None = None
    enabled: bool
    created_at: datetime
    updated_at: datetime


class CameraAlertSchedule(BaseModel):
    id: str
    camera_id: str
    family_id: str
    day_of_week: int
    start_time: str
    end_time: str
    enabled: bool
    created_at: datetime


class SavedLocation(BaseModel):
    id: str
    family_id: str
    member_id: str
    label: str
    lat: float
    lng: float
    created_at: str


class CreateSavedLocationRequest(BaseModel):
    member_id: str
    label: str  # home, school, work


class CreateCameraRequest(BaseModel):
    label: str
    location_label: str
    stream_url: str | None = None


class UpdateCameraRequest(BaseModel):
    label: str | None = None
    location_label: str | None = None
    stream_url: str | None = None
    enabled: bool | None = None


class CreateScheduleRequest(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: str  # e.g. '23:00'
    end_time: str    # e.g. '05:00'


class IncidentRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    family_id: str = ""
    event_id: str
    summary: str
    classification_level: str
    status: str = "active"
    affected_members: list[dict[str, Any]] = Field(default_factory=list)
    source_kind: SourceKind
    severity: Severity
    location_label: str
    created_at: datetime = Field(default_factory=utc_now)


class EmergencyContact(BaseModel):
    id: str = Field(default_factory=lambda: new_id("ec"))
    family_id: str = ""
    name: str
    phone_e164: str | None = None
    email: str | None = None
    relationship: str = "neighbor"
    created_at: datetime = Field(default_factory=utc_now)


class CreateEmergencyContactRequest(BaseModel):
    name: str
    phone_e164: str | None = None
    email: str | None = None
    relationship: str = "neighbor"


class NotifyEmergencyContactRequest(BaseModel):
    contact_id: str | None = None  # None means notify all
