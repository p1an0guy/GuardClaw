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
  TimelineEntry
} from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GuardClaw API ${response.status}: ${detail}`);
  }

  return (await response.json()) as T;
}

export function getHousehold(): Promise<HouseholdState> {
  return requestJson<HouseholdState>("/api/household");
}

export function getActiveIncident(): Promise<ActiveIncidentResponse> {
  return requestJson<ActiveIncidentResponse>("/api/incidents/active");
}

export function getTimeline(): Promise<TimelineEntry[]> {
  return requestJson<TimelineEntry[]>("/api/actions/timeline");
}

export function simulateEvent(source: SourceKind, live: boolean): Promise<ActiveIncidentResponse> {
  return requestJson<ActiveIncidentResponse>("/api/simulate/event", {
    method: "POST",
    body: JSON.stringify({ source, live, include_camera: true })
  });
}

export function acknowledgeAction(targetId: string): Promise<AcknowledgeResponse> {
  return requestJson<AcknowledgeResponse>("/api/actions/acknowledge", {
    method: "POST",
    body: JSON.stringify({
      target_id: targetId,
      acknowledged_by: "dashboard-demo"
    })
  });
}

export function getAuditLog(): Promise<AlertAuditEntry[]> {
  return requestJson<AlertAuditEntry[]>("/api/alerts/audit-log");
}

export function getLatestIncident(): Promise<IncidentRecord | null> {
  return requestJson<IncidentRecord>("/api/incidents/latest").catch(() => null);
}

export function getIncidents(): Promise<IncidentRecord[]> {
  return requestJson<IncidentRecord[]>("/api/incidents");
}

export function getSavedLocations(): Promise<SavedLocation[]> {
  return requestJson<SavedLocation[]>("/api/saved-locations");
}

export function createSavedLocation(memberId: string, label: string): Promise<SavedLocation> {
  return requestJson<SavedLocation>("/api/saved-locations", {
    method: "POST",
    body: JSON.stringify({ member_id: memberId, label }),
  });
}

export function getCameras(): Promise<Camera[]> {
  return requestJson<Camera[]>("/api/cameras");
}

export function createCamera(data: { label: string; location_label: string; stream_url?: string }): Promise<Camera> {
  return requestJson<Camera>("/api/cameras", { method: "POST", body: JSON.stringify(data) });
}

export function updateCamera(id: string, data: Partial<{ label: string; location_label: string; stream_url: string; enabled: boolean }>): Promise<Camera> {
  return requestJson<Camera>(`/api/cameras/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export function deleteCamera(id: string): Promise<void> {
  return requestJson<void>(`/api/cameras/${id}`, { method: "DELETE" });
}

export function getCameraSchedules(cameraId: string): Promise<CameraAlertSchedule[]> {
  return requestJson<CameraAlertSchedule[]>(`/api/cameras/${cameraId}/schedules`);
}

export function createCameraSchedule(cameraId: string, data: { day_of_week: number; start_time: string; end_time: string }): Promise<CameraAlertSchedule> {
  return requestJson<CameraAlertSchedule>(`/api/cameras/${cameraId}/schedules`, { method: "POST", body: JSON.stringify(data) });
}

export function deleteCameraSchedule(cameraId: string, scheduleId: string): Promise<void> {
  return requestJson<void>(`/api/cameras/${cameraId}/schedules/${scheduleId}`, { method: "DELETE" });
}

export function getEmergencyContacts(): Promise<EmergencyContact[]> {
  return requestJson<EmergencyContact[]>("/api/emergency-contacts");
}

export function createEmergencyContact(data: { name: string; phone_e164?: string; email?: string; relationship?: string }): Promise<EmergencyContact> {
  return requestJson<EmergencyContact>("/api/emergency-contacts", { method: "POST", body: JSON.stringify(data) });
}

export function deleteEmergencyContact(id: string): Promise<void> {
  return requestJson<void>(`/api/emergency-contacts/${id}`, { method: "DELETE" });
}

export function notifyEmergencyContact(contactId?: string): Promise<{ notified: number; contacts: string[] }> {
  return requestJson<{ notified: number; contacts: string[] }>("/api/emergency-contacts/notify", {
    method: "POST",
    body: JSON.stringify(contactId ? { contact_id: contactId } : {}),
  });
}