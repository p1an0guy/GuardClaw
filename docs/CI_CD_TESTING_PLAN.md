# GuardClaw CI/CD Testing Plan

## Goal

Add GitHub Actions checks that catch regressions in the demo-critical path while staying fast enough for same-day hackathon iteration:

1. Backend API starts and can simulate an alert.
2. Hermes classification fallback/routing rules stay deterministic.
3. Supabase household mapping does not break mobile location ingestion.
4. Frontend and mobile TypeScript contracts stay aligned with backend responses.
5. Frontend builds successfully.

## Phase 1: Baseline CI Workflow

Create `.github/workflows/ci.yml` with three jobs that run on pull requests and pushes to `master` plus the demo branch.

### Backend Job

Environment:

- `ubuntu-latest`
- Python 3.12
- `GUARDCLAW_SQLITE_PATH=/tmp/guardclaw-ci.db`
- `GUARDCLAW_USE_HERMES=false`

Commands:

```bash
cd backend
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m compileall app
python - <<'PY'
from fastapi.testclient import TestClient
from app.main import app

with TestClient(app) as client:
    response = client.post(
        "/api/simulate/event",
        json={"source": "nws", "live": False, "include_camera": True},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["incident"]["source_kind"] == "nws"
    assert data["camera_signal"]["source"] == "prerecorded_demo"
    assert data["classification"]["level"] in {
        "minor",
        "moderate",
        "major",
        "life_threatening",
    }
    assert len(data["action_plan"]["outbound_messages"]) >= 1
PY
```

### Frontend Job

Environment:

- `ubuntu-latest`
- Node 22

Commands:

```bash
cd frontend
npm ci
npm run typecheck
npm run build
```

### Mobile Job

Environment:

- `ubuntu-latest`
- Node 22

Commands:

```bash
cd mobile
npm ci
npx tsc --noEmit
```

## Phase 2: Backend Unit Tests

Add `pytest` to backend dev dependencies and create `backend/tests/`.

Recommended dependency change:

```txt
pytest>=8.0,<9.0
```

Test files to add:

- `tests/test_classifier.py`
- `tests/test_risk_engine.py`
- `tests/test_supabase_household.py`
- `tests/test_api_simulate.py`

Required test cases:

- Hermes disabled returns local fallback classification.
- Invalid Hermes classification is retried once, then local fallback is used.
- `life_threatening` targets every household member.
- `major` targets guardians plus directly affected members.
- `moderate` targets guardians.
- `minor` targets only the priority-1 guardian.
- Commuting members route to `call`.
- Home/work/away members route to `telegram`.
- Supabase row mapping preserves mobile statuses: `Safe`, `Home`, `Moving`, `Needs Help`, `Offline`.
- OpenFEMA IPAWS archive events are never marked `is_live=true`.
- `POST /api/simulate/event` returns `classification`, `camera_signal`, `notification_intents`, and timeline entries.

CI command after this phase:

```bash
cd backend
python -m pytest -q
```

## Phase 3: Contract Fixtures

Add checked-in JSON fixtures for the API shapes most likely to break the dashboard:

- `backend/tests/fixtures/simulate_event_response.json`
- `backend/tests/fixtures/household_response.json`
- `backend/tests/fixtures/timeline_response.json`

Add a backend test that validates fresh endpoint responses against the fixture-required keys, not exact timestamps or IDs.

Add a frontend check that imports representative objects typed as:

- `ActiveIncidentResponse`
- `HouseholdState`
- `TimelineEntry[]`

This catches backend/frontend type drift without needing a full generated OpenAPI client during the hackathon.

## Phase 4: GitHub Actions Secrets and Demo Smoke

Do not put real Supabase or Hermes secrets in normal PR CI. Keep regular CI offline and deterministic.

For optional manual smoke tests, create a separate workflow:

- `.github/workflows/demo-smoke.yml`
- Trigger: `workflow_dispatch`
- Required secrets:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_FAMILY_ID`
  - `HERMES_API_BASE_URL`
  - `HERMES_API_KEY`

Manual smoke should:

1. Start the backend with Supabase/Hermes env vars.
2. Trigger `POST /api/simulate/event`.
3. Verify timeline contains `alert_classified`.
4. Verify at least one outbound message has either `sent_via_hermes`, `sent_stub`, or `failed` with a clear timeline detail.

Keep this optional because remote Hermes availability may depend on the demo machine.

## Phase 5: Branch Protection

After the baseline workflow is green, enable branch protection on `master`:

- Require pull request before merge.
- Require status checks:
  - `backend`
  - `frontend`
  - `mobile`
- Require branches to be up to date before merge.
- Do not require the optional demo smoke workflow.

## Acceptance Criteria

CI is considered useful for today when:

- A PR fails if backend simulation no longer returns classification/camera/routing data.
- A PR fails if frontend or mobile TypeScript breaks.
- A PR fails if the dashboard production build breaks.
- A PR does not need live Supabase, live NWS, or Hermes to pass regular checks.
- Optional manual smoke can be used before the final demo to test the real Supabase/Hermes path.
