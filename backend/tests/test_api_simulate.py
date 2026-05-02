from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_simulate_event_returns_required_fields():
    with TestClient(app) as client:
        response = client.post(
            "/api/simulate/event",
            json={"source": "nws", "live": False, "include_camera": True},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["classification"] is not None
        assert data["camera_signal"] is not None
        assert len(data["action_plan"]["notification_intents"]) >= 1
        assert len(data["action_plan"]["outbound_messages"]) >= 1

        # Verify timeline was populated
        timeline_resp = client.get("/api/actions/timeline")
        assert timeline_resp.status_code == 200
        timeline = timeline_resp.json()
        assert len(timeline) >= 1
        kinds = [entry["kind"] for entry in timeline]
        assert "alert_classified" in kinds


def test_ipaws_events_never_marked_live():
    with TestClient(app) as client:
        response = client.post(
            "/api/simulate/event",
            json={"source": "ipaws", "live": False, "include_camera": False},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["incident"]["is_live"] is False
