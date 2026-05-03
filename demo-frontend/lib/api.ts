import type {
  AcknowledgeResponse,
  ActiveIncidentResponse,
  AlertAuditEntry,
  Camera,
  CameraAlertSchedule,
  EmergencyContact,
  HouseholdState,
  IncidentRecord,
  SavedLocation,
  SourceKind,
  TimelineEntry,
} from "./types";
import {
  mockActiveIncident,
  mockAuditLog,
  mockCameraSchedules,
  mockCameras,
  mockEmergencyContacts,
  mockHousehold,
  mockIncidents,
  mockSavedLocations,
  mockTimeline,
} from "./mockData";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const FRONTEND_ONLY =
  process.env.NEXT_PUBLIC_FRONTEND_ONLY === "true" ||
  process.env.NEXT_PUBLIC_API_BASE_URL === "mock" ||
  (!process.env.NEXT_PUBLIC_API_BASE_URL && process.env.NODE_ENV === "production");

let timeline = clone(mockTimeline);
let savedLocations = clone(mockSavedLocations);
let emergencyContacts = clone(mockEmergencyContacts);
let cameras = clone(mockCameras);
let cameraSchedules = clone(mockCameraSchedules);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function immediate<T>(value: T): Promise<T> {
  return Promise.resolve(clone(value));
}

function newMockId(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GuardClaw API ${response.status}: ${detail}`);
  }

  return (await response.json()) as T;
}

export function getHousehold(): Promise<HouseholdState> {
  if (FRONTEND_ONLY) return immediate(mockHousehold);
  return requestJson<HouseholdState>("/api/household");
}

export function getActiveIncident(): Promise<ActiveIncidentResponse> {
  if (FRONTEND_ONLY) return immediate(mockActiveIncident);
  return requestJson<ActiveIncidentResponse>("/api/incidents/active");
}

export function getTimeline(): Promise<TimelineEntry[]> {
  if (FRONTEND_ONLY) return immediate(timeline);
  return requestJson<TimelineEntry[]>("/api/actions/timeline");
}

export function simulateEvent(source: SourceKind, live: boolean): Promise<ActiveIncidentResponse> {
  if (FRONTEND_ONLY) return immediate(mockActiveIncident);
  return requestJson<ActiveIncidentResponse>("/api/simulate/event", {
    method: "POST",
    body: JSON.stringify({ source, live, include_camera: true }),
  });
}

export function acknowledgeAction(targetId: string): Promise<AcknowledgeResponse> {
  if (FRONTEND_ONLY) {
    const acknowledgedAt = new Date().toISOString();
    timeline = timeline.map((entry) =>
      entry.id === targetId ? { ...entry, acknowledged_at: acknowledgedAt } : entry
    );
    const ackEntry: TimelineEntry = {
      id: newMockId("ack"),
      incident_id: mockActiveIncident.incident?.id ?? null,
      kind: "acknowledgement",
      title: "Action acknowledged",
      detail: `dashboard-demo acknowledged ${targetId}.`,
      actor: "dashboard-demo",
      created_at: acknowledgedAt,
      acknowledged_at: null,
      metadata: { target_id: targetId },
      demo_mode: true,
    };
    timeline = [...timeline, ackEntry];
    return immediate({ acknowledged: true, timeline_entry: ackEntry, demo_mode: true });
  }
  return requestJson<AcknowledgeResponse>("/api/actions/acknowledge", {
    method: "POST",
    body: JSON.stringify({
      target_id: targetId,
      acknowledged_by: "dashboard-demo",
    }),
  });
}

export function getAuditLog(): Promise<AlertAuditEntry[]> {
  if (FRONTEND_ONLY) return immediate(mockAuditLog);
  return requestJson<AlertAuditEntry[]>("/api/alerts/audit-log");
}

export function getLatestIncident(): Promise<IncidentRecord | null> {
  if (FRONTEND_ONLY) return immediate(mockIncidents[0] ?? null);
  return requestJson<IncidentRecord>("/api/incidents/latest").catch(() => null);
}

export function getIncidents(): Promise<IncidentRecord[]> {
  if (FRONTEND_ONLY) return immediate(mockIncidents);
  return requestJson<IncidentRecord[]>("/api/incidents");
}

export function getSavedLocations(): Promise<SavedLocation[]> {
  if (FRONTEND_ONLY) return immediate(savedLocations);
  return requestJson<SavedLocation[]>("/api/saved-locations");
}

export function createSavedLocation(memberId: string, label: string): Promise<SavedLocation> {
  if (FRONTEND_ONLY) {
    const member = mockHousehold.members.find((item) => item.id === memberId);
    const location = member?.location;
    const saved: SavedLocation = {
      id: newMockId("saved"),
      family_id: mockHousehold.id,
      member_id: memberId,
      label,
      lat: location?.latitude ?? 35.3004,
      lng: location?.longitude ?? -120.6625,
      created_at: new Date().toISOString(),
    };
    savedLocations = [
      ...savedLocations.filter((item) => !(item.member_id === memberId && item.label === label)),
      saved,
    ];
    return immediate(saved);
  }
  return requestJson<SavedLocation>("/api/saved-locations", {
    method: "POST",
    body: JSON.stringify({ member_id: memberId, label }),
  });
}

export function getCameras(): Promise<Camera[]> {
  if (FRONTEND_ONLY) return immediate(cameras);
  return requestJson<Camera[]>("/api/cameras");
}

export function createCamera(data: { label: string; location_label: string; stream_url?: string }): Promise<Camera> {
  if (FRONTEND_ONLY) {
    const camera: Camera = {
      id: newMockId("camera"),
      family_id: mockHousehold.id,
      label: data.label,
      location_label: data.location_label,
      stream_url: data.stream_url ?? null,
      enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    cameras = [...cameras, camera];
    return immediate(camera);
  }
  return requestJson<Camera>("/api/cameras", { method: "POST", body: JSON.stringify(data) });
}

export function updateCamera(
  id: string,
  data: Partial<{ label: string; location_label: string; stream_url: string; enabled: boolean }>
): Promise<Camera> {
  if (FRONTEND_ONLY) {
    let updated = cameras.find((camera) => camera.id === id);
    if (!updated) throw new Error("Camera not found");
    updated = {
      ...updated,
      ...data,
      stream_url: data.stream_url === undefined ? updated.stream_url : data.stream_url,
      updated_at: new Date().toISOString(),
    };
    cameras = cameras.map((camera) => (camera.id === id ? updated : camera));
    return immediate(updated);
  }
  return requestJson<Camera>(`/api/cameras/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export function deleteCamera(id: string): Promise<void> {
  if (FRONTEND_ONLY) {
    cameras = cameras.filter((camera) => camera.id !== id);
    cameraSchedules = cameraSchedules.filter((schedule) => schedule.camera_id !== id);
    return Promise.resolve();
  }
  return requestJson<void>(`/api/cameras/${id}`, { method: "DELETE" });
}

export function getCameraSchedules(cameraId: string): Promise<CameraAlertSchedule[]> {
  if (FRONTEND_ONLY) return immediate(cameraSchedules.filter((schedule) => schedule.camera_id === cameraId));
  return requestJson<CameraAlertSchedule[]>(`/api/cameras/${cameraId}/schedules`);
}

export function createCameraSchedule(
  cameraId: string,
  data: { day_of_week: number; start_time: string; end_time: string }
): Promise<CameraAlertSchedule> {
  if (FRONTEND_ONLY) {
    const schedule: CameraAlertSchedule = {
      id: newMockId("schedule"),
      camera_id: cameraId,
      family_id: mockHousehold.id,
      day_of_week: data.day_of_week,
      start_time: data.start_time,
      end_time: data.end_time,
      enabled: true,
      created_at: new Date().toISOString(),
    };
    cameraSchedules = [...cameraSchedules, schedule];
    return immediate(schedule);
  }
  return requestJson<CameraAlertSchedule>(`/api/cameras/${cameraId}/schedules`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deleteCameraSchedule(cameraId: string, scheduleId: string): Promise<void> {
  if (FRONTEND_ONLY) {
    cameraSchedules = cameraSchedules.filter((schedule) => schedule.id !== scheduleId);
    return Promise.resolve();
  }
  return requestJson<void>(`/api/cameras/${cameraId}/schedules/${scheduleId}`, { method: "DELETE" });
}

export function getEmergencyContacts(): Promise<EmergencyContact[]> {
  if (FRONTEND_ONLY) return immediate(emergencyContacts);
  return requestJson<EmergencyContact[]>("/api/emergency-contacts");
}

export function createEmergencyContact(data: {
  name: string;
  phone_e164?: string;
  email?: string;
  relationship?: string;
}): Promise<EmergencyContact> {
  if (FRONTEND_ONLY) {
    const contact: EmergencyContact = {
      id: newMockId("ec"),
      family_id: mockHousehold.id,
      name: data.name,
      phone_e164: data.phone_e164 ?? null,
      email: data.email ?? null,
      relationship: data.relationship ?? "neighbor",
      created_at: new Date().toISOString(),
    };
    emergencyContacts = [...emergencyContacts, contact];
    return immediate(contact);
  }
  return requestJson<EmergencyContact>("/api/emergency-contacts", { method: "POST", body: JSON.stringify(data) });
}

export function deleteEmergencyContact(id: string): Promise<void> {
  if (FRONTEND_ONLY) {
    emergencyContacts = emergencyContacts.filter((contact) => contact.id !== id);
    return Promise.resolve();
  }
  return requestJson<void>(`/api/emergency-contacts/${id}`, { method: "DELETE" });
}

export function notifyEmergencyContact(contactId?: string): Promise<{ notified: number; contacts: string[] }> {
  if (FRONTEND_ONLY) {
    const targets = contactId
      ? emergencyContacts.filter((contact) => contact.id === contactId)
      : emergencyContacts;
    return immediate({ notified: targets.length, contacts: targets.map((contact) => contact.name) });
  }
  return requestJson<{ notified: number; contacts: string[] }>("/api/emergency-contacts/notify", {
    method: "POST",
    body: JSON.stringify(contactId ? { contact_id: contactId } : {}),
  });
}

export async function chatWithGuardClaw(
  message: string,
  history: Array<{ role: string; content: string }>
): Promise<string> {
  if (FRONTEND_ONLY) {
    const lower = message.toLowerCase();
    if (lower.includes("maya") || lower.includes("child")) {
      return "Maya is marked home near the Cal Poly alert area. GuardClaw prioritizes confirming her status first.";
    }
    if (lower.includes("jordan") || lower.includes("route") || lower.includes("commut")) {
      return "Jordan is marked commuting near the Foothill corridor, so the plan drafts a call and recommends avoiding campus routes.";
    }
    if (lower.includes("send") || lower.includes("notify") || lower.includes("message")) {
      return "This frontend-only demo logs notification drafts to the timeline. It does not send real SMS, calls, Telegram, email, or dispatch requests.";
    }
    if (lower.includes("source") || lower.includes("ipaws")) {
      return "The visible incident is an IPAWS-style replay fixture for the hackathon demo, centered on Cal Poly San Luis Obispo.";
    }
    return "GuardClaw combines the alert, household locations, and camera context into a prioritized action plan for the family.";
  }

  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  const data = (await response.json()) as { reply?: string };
  return data.reply ?? "No response returned.";
}
