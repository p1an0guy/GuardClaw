# Implementation Plan — NWS Live Alert Polling with Multi-Source Audit Log

## Problem Statement
Replace the manual "Run alert" trigger with a background poller that continuously fetches NWS alerts, filters by proximity (SLO County zone CAZ039), logs every alert to a source-agnostic audit log, and sends relevant ones through the Hermes pipeline.

## Requirements
- Poll NWS `alerts/active?zone=CAZ039` continuously (60s interval)
- Proximity gate = zone filter (if NWS returns it for CAZ039, it's relevant)
- Every new alert → written to audit log (deduped by `source_kind` + `source_id`)
- New alert → full Hermes pipeline (classify → action plan → timeline → messaging)
- Audit log is source-agnostic so IPAWS, SLO County, Cal Poly can be added later
- Frontend dashboard shows the audit log, labeled by source

## NWS API
- `GET https://api.weather.gov/alerts/active?zone=CAZ039` — free, no auth, GeoJSON
- Rate limit: no more than every 30s (we use 60s)
- Each alert has a unique `properties.id` for deduplication
- `CAZ039` = San Luis Obispo County forecast zone

## Flow
```
Poller (every 60s)
  → GET https://api.weather.gov/alerts/active?zone=CAZ039
  → for each feature:
      → check store.has_audit_entry(source_kind=nws, source_id=nws_alert_id)
      → if new:
          → write AlertAuditEntry to audit log
          → call run_alert_pipeline(ThreatEvent)
  → errors caught and logged, loop never crashes

Dashboard (every 30s)
  → GET /api/alerts/audit-log
  → renders entries with source badge, event type, severity, title, timestamp
```

## Files Changed
- **Created**: `backend/app/services/pipeline.py`
- **Created**: `backend/app/services/nws_poller.py`
- **Modified**: `backend/app/models/schemas.py` — added `AlertAuditEntry`
- **Modified**: `backend/app/repositories/store.py` — added audit log table + methods
- **Modified**: `backend/app/main.py` — added audit log endpoint, registered poller in lifespan, slimmed down simulate_event
- **Modified**: `frontend/lib/types.ts` — added `AlertAuditEntry`
- **Modified**: `frontend/lib/api.ts` — added `getAuditLog()`
- **Modified**: `frontend/app/page.tsx` — added audit log panel + polling

## Key Constraints
- Minimal code only — no extra abstractions
- Poller loop must never crash — all errors caught internally
- Audit log dedup key is `(source_kind, source_id)` — source-agnostic
- `run_alert_pipeline` callable with no HTTP context
- "Run alert" button continues to work identically
