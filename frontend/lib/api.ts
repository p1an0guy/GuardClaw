import type {
  AcknowledgeResponse,
  ActiveIncidentResponse,
  HouseholdState,
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
