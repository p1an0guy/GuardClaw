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


def test_cal_poly_ipaws_shelter_scenario_triggers_life_threatening_replay():
    with TestClient(app) as client:
        response = client.post(
            "/api/simulate/event",
            json={
                "source": "ipaws",
                "live": False,
                "location_label": "Cal Poly, San Luis Obispo, CA",
                "include_camera": True,
                "camera_scenario": "front_walkway",
                "demo_scenario": "cal_poly_ipaws_school_shelter",
            },
        )

        assert response.status_code == 200
        data = response.json()
        incident = data["incident"]
        assert incident["source_kind"] == "ipaws"
        assert incident["event_type"] == "school_shooter_shelter_in_place"
        assert incident["title"] == "IPAWS School Shooter Shelter-in-Place Alert: Cal Poly SLO"
        assert incident["location_label"] == "Cal Poly, San Luis Obispo, CA"
        assert incident["severity"] == "extreme"
        assert incident["is_live"] is False
        assert incident["is_simulated"] is True
        assert incident["demo_mode"] is True
        assert incident["raw"]["source_freshness"] == "replay"
        assert data["classification"]["level"] == "life_threatening"
        assert len(data["action_plan"]["notification_intents"]) == 3

        timeline_resp = client.get("/api/actions/timeline")
        assert timeline_resp.status_code == 200
        timeline_kinds = [entry["kind"] for entry in timeline_resp.json()]
        assert "incident_created" in timeline_kinds
        assert "alert_classified" in timeline_kinds
        assert "plan_created" in timeline_kinds
        assert "outbound_message" in timeline_kinds

        audit_resp = client.get("/api/alerts/audit-log")
        assert audit_resp.status_code == 200
        audit_entries = audit_resp.json()
        assert any(
            entry["source_kind"] == "ipaws"
            and entry["event_type"] == "school_shooter_shelter_in_place"
            and entry["pipeline_triggered"] is True
            for entry in audit_entries
        )
