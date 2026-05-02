# Threat Pipeline Design

## Flow
1. `POST /api/simulate/event` receives an optional source selection.
2. `AlertSourceService` returns a normalized `ThreatEvent`.
3. The seeded household is loaded from SQLite.
4. `build_action_plan(event, household)` creates deterministic affected people, notify order, recommended actions, rationale, and drafts.
5. `HermesAdapter` optionally refines draft wording through the Hermes API server.
6. `MessagingService` logs each outbound draft to the timeline as a stubbed send.
7. Active incident state is stored in SQLite and returned to the caller.

## Interfaces
- `ThreatEvent` carries source metadata and demo/live flags.
- `HouseholdState` carries members, calendar items, and home signal.
- `ActionPlan` carries affected people, notify order, actions, rationale, and outbound messages.
- `TimelineEntry` records incident creation, plan creation, recommended actions, message drafts, and acknowledgements.

## External Sources
- NWS live fetch is best-effort and optional.
- FEMA IPAWS, SLO County, and Cal Poly are replay/manual-ingest fixtures until access to reliable machine-readable feeds is confirmed.

