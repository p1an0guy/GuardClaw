# Threat Pipeline Requirements

## User Story
As a guardian, I want GuardClaw to ingest a nearby public safety alert and explain whether anyone in my household may be affected, so I can coordinate a safe next step quickly.

## Functional Requirements
- `POST /api/simulate/event` creates an active incident immediately.
- Supported replay source choices: NWS, FEMA IPAWS, SLO County, Cal Poly SLO.
- The system stores the active `ThreatEvent`, `HouseholdState`, generated `ActionPlan`, outbound message drafts, and timeline entries.
- The risk engine marks the child at home as the most affected person.
- The notify order is guardian 1, then guardian 2.
- The rationale is human-readable and mentions alert context, home signal, guardian availability, and calendar context.
- Every outbound draft appears in the timeline.

## Non-Functional Requirements
- API contracts use Pydantic validation.
- Demo mode is explicit in payloads.
- Backend must run without Hermes installed or running.
- Hermes integration failures fall back to deterministic local drafts.

