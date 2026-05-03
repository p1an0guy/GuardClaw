export type Channel = "telegram" | "call" | "email" | "sms" | "discord";
export type SourceKind = "nws" | "ipaws" | "slo_county" | "cal_poly" | "cctv";
export type AlertLevel = "minor" | "moderate" | "major" | "life_threatening";

export interface ThreatEvent {
  id: string;
  event_type: string;
  title: string;
  description: string;
  severity: "low" | "moderate" | "high" | "extreme";
  location_label: string;
  issued_at: string;
  expires_at: string | null;
  source_kind: SourceKind;
  source_name: string;
  source_url: string | null;
  is_live: boolean;
  is_simulated: boolean;
  demo_mode: boolean;
  raw: Record<string, unknown>;
}

export interface MemberLocation {
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  speed_mps: number | null;
  label: string;
  source: "demo_seed" | "mobile_app" | "manual";
  observed_at: string;
}

export interface HouseholdMember {
  id: string;
  name: string;
  role: "guardian" | "child";
  age_category: string;
  status: "home" | "away" | "work" | "commuting" | "needs_help" | "offline";
  priority: number;
  channels: Channel[];
  location: MemberLocation | null;
  mobile_status: string | null;
  phone_e164: string | null;
  telegram_chat_id: string | null;
}

export interface HomeSignal {
  label: string;
  occupancy_confirmed: boolean;
  observed_at: string;
  confidence: number;
}

export interface CalendarItem {
  id: string;
  title: string;
  starts_at: string;
  location_label: string;
  participants: string[];
}

export interface HouseholdState {
  id: string;
  members: HouseholdMember[];
  home_signal: HomeSignal;
  calendar_items: CalendarItem[];
  demo_mode: boolean;
  updated_at: string;
}

export interface AffectedPerson {
  member_id: string;
  name: string;
  risk_level: string;
  reason: string;
}

export interface NotifyTarget {
  member_id: string;
  name: string;
  order: number;
  channels: Channel[];
  reason: string;
}

export interface RecommendedAction {
  id: string;
  label: string;
  detail: string;
  priority: number;
}

export interface CameraSignal {
  id: string;
  label: string;
  clip_url: string;
  source: string;
  occupancy_confirmed: boolean;
  confidence: number;
  observed_at: string;
  summary: string;
}

export interface AlertClassification {
  level: AlertLevel;
  confidence: number;
  rationale: string;
  classified_by: string;
  source_notes: string[];
}

export interface NotificationIntent {
  id: string;
  member_id: string;
  member_name: string;
  channel: Channel;
  reason: string;
  movement_state: HouseholdMember["status"];
  priority: number;
}

export interface OutboundMessage {
  id: string;
  incident_id: string;
  recipient_id: string;
  recipient_name: string;
  channel: Channel;
  status: "draft" | "sent_stub" | "sent_via_hermes" | "failed";
  subject: string;
  body: string;
  created_at: string;
  demo_mode: boolean;
  generated_by: string;
}

export interface ActionPlan {
  id: string;
  incident_id: string;
  classification: AlertClassification | null;
  camera_signal: CameraSignal | null;
  affected_people: AffectedPerson[];
  notify_order: NotifyTarget[];
  notification_intents: NotificationIntent[];
  recommended_actions: RecommendedAction[];
  rationale: string;
  outbound_messages: OutboundMessage[];
  created_at: string;
  demo_mode: boolean;
  generated_by: string;
}

export interface TimelineEntry {
  id: string;
  incident_id: string | null;
  kind: string;
  title: string;
  detail: string;
  actor: string;
  created_at: string;
  acknowledged_at: string | null;
  metadata: Record<string, unknown>;
  demo_mode: boolean;
}

export interface ActiveIncidentResponse {
  incident: ThreatEvent | null;
  action_plan: ActionPlan | null;
  camera_signal: CameraSignal | null;
  classification: AlertClassification | null;
  summary: string | null;
  demo_mode: boolean;
}

export interface AcknowledgeResponse {
  acknowledged: boolean;
  timeline_entry: TimelineEntry;
  demo_mode: boolean;
}

export interface AlertAuditEntry {
  id: string;
  source_kind: SourceKind;
  source_id: string;
  event_type: string;
  severity: string;
  title: string;
  ingested_at: string;
  pipeline_triggered: boolean;
}

export interface Camera {
  id: string;
  family_id: string;
  label: string;
  location_label: string;
  stream_url: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CameraAlertSchedule {
  id: string;
  camera_id: string;
  family_id: string;
  day_of_week: number; // 0=Monday, 6=Sunday
  start_time: string;
  end_time: string;
  enabled: boolean;
  created_at: string;
}

export interface IncidentRecord {
  id: string;
  event_id: string;
  summary: string;
  classification_level: string;
  status: string;
  affected_members: Array<{ member_id: string; name: string; risk_level: string }>;
  source_kind: SourceKind;
  severity: string;
  location_label: string;
  created_at: string;
}

export interface SavedLocation {
  id: string;
  family_id: string;
  member_id: string;
  label: string;
  lat: number;
  lng: number;
  created_at: string;
}
