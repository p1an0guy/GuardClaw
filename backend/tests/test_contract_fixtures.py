from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

FIXTURES = Path(__file__).parent / "fixtures"


def _required_keys(obj: object) -> set[str]:
    """Recursively collect all keys from a fixture object (ignoring __any__ values)."""
    if isinstance(obj, dict):
        return set(obj.keys())
    return set()


def _check_keys(actual: dict, fixture: dict, path: str = "") -> list[str]:
    """Verify actual response contains all keys defined in the fixture."""
    errors: list[str] = []
    for key in fixture:
        full_path = f"{path}.{key}" if path else key
        if key not in actual:
            errors.append(f"Missing key: {full_path}")
        elif isinstance(fixture[key], dict) and isinstance(actual.get(key), dict):
            errors.extend(_check_keys(actual[key], fixture[key], full_path))
    return errors


def test_simulate_event_response_matches_fixture():
    fixture = json.loads((FIXTURES / "simulate_event_response.json").read_text())
    with TestClient(app) as client:
        resp = client.post(
            "/api/simulate/event",
            json={"source": "nws", "live": False, "include_camera": True},
        )
        assert resp.status_code == 200
        data = resp.json()
    errors = _check_keys(data, fixture)
    assert not errors, f"Contract violations: {errors}"


def test_household_response_matches_fixture():
    fixture = json.loads((FIXTURES / "household_response.json").read_text())
    with TestClient(app) as client:
        resp = client.get("/api/household")
        assert resp.status_code == 200
        data = resp.json()
    errors = _check_keys(data, fixture)
    assert not errors, f"Contract violations: {errors}"
    # Verify members array has at least one entry with correct keys
    if data["members"]:
        member_fixture = fixture["members"][0]
        errors = _check_keys(data["members"][0], member_fixture, "members[0]")
        assert not errors, f"Member contract violations: {errors}"


def test_timeline_response_matches_fixture():
    fixture = json.loads((FIXTURES / "timeline_response.json").read_text())
    with TestClient(app) as client:
        # Trigger a simulation first to populate timeline
        client.post(
            "/api/simulate/event",
            json={"source": "nws", "live": False, "include_camera": True},
        )
        resp = client.get("/api/actions/timeline")
        assert resp.status_code == 200
        data = resp.json()
    assert len(data) >= 1, "Timeline should have entries after simulation"
    entry_fixture = fixture[0]
    errors = _check_keys(data[0], entry_fixture, "timeline[0]")
    assert not errors, f"Timeline contract violations: {errors}"
