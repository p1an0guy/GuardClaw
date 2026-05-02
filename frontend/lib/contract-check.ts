/**
 * Contract type-check file.
 * This file is compiled during `npm run typecheck` to catch backend/frontend type drift.
 * It does NOT run at runtime — it only needs to compile successfully.
 */
import type {
  ActiveIncidentResponse,
  HouseholdState,
  TimelineEntry,
} from "./types";

// Verify ActiveIncidentResponse shape compiles
const _incident: ActiveIncidentResponse = {
  incident: null,
  action_plan: null,
  camera_signal: null,
  classification: null,
  demo_mode: true,
};

// Verify HouseholdState shape compiles
const _household: HouseholdState = {
  id: "test",
  members: [],
  home_signal: {
    label: "test",
    occupancy_confirmed: true,
    observed_at: "2024-01-01T00:00:00Z",
    confidence: 0.9,
  },
  calendar_items: [],
  demo_mode: true,
  updated_at: "2024-01-01T00:00:00Z",
};

// Verify TimelineEntry[] shape compiles
const _timeline: TimelineEntry[] = [
  {
    id: "test",
    incident_id: null,
    kind: "test",
    title: "test",
    detail: "test",
    actor: "guardclaw",
    created_at: "2024-01-01T00:00:00Z",
    acknowledged_at: null,
    metadata: {},
    demo_mode: true,
  },
];

// Suppress unused variable warnings
void _incident;
void _household;
void _timeline;
