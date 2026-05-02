from __future__ import annotations

from app.models.schemas import (
    AlertLevel,
    CameraSignal,
    HouseholdState,
    Severity,
    ThreatEvent,
    utc_now,
)
from app.services.classifier import local_classify_alert
from app.services.demo_seed import build_demo_household


def _make_event(severity: Severity = Severity.HIGH) -> ThreatEvent:
    return ThreatEvent(
        event_type="weather_alert",
        title="Test alert",
        description="Test",
        severity=severity,
        location_label="Test",
        source_kind="nws",
        source_name="Test",
    )


def _make_camera(confidence: float = 0.9, occupancy: bool = True) -> CameraSignal:
    return CameraSignal(
        label="Test cam",
        clip_url="https://example.com/clip.mp4",
        occupancy_confirmed=occupancy,
        confidence=confidence,
        observed_at=utc_now(),
        summary="Test camera signal",
    )


def test_local_fallback_classifier_returns_local_fallback():
    household = build_demo_household()
    event = _make_event()
    result = local_classify_alert(event, household, None)
    assert result.classified_by == "local_fallback"


def test_classification_level_is_valid():
    household = build_demo_household()
    event = _make_event()
    result = local_classify_alert(event, household, None)
    assert result.level in {AlertLevel.MINOR, AlertLevel.MODERATE, AlertLevel.MAJOR, AlertLevel.LIFE_THREATENING}


def test_extreme_severity_produces_life_threatening():
    household = build_demo_household()
    event = _make_event(Severity.EXTREME)
    result = local_classify_alert(event, household, None)
    assert result.level == AlertLevel.LIFE_THREATENING


def test_camera_signal_increases_classification():
    household = build_demo_household()
    event = _make_event(Severity.MODERATE)
    without_camera = local_classify_alert(event, household, None)
    with_camera = local_classify_alert(event, household, _make_camera())
    # Camera should increase or maintain the level
    levels = [AlertLevel.MINOR, AlertLevel.MODERATE, AlertLevel.MAJOR, AlertLevel.LIFE_THREATENING]
    assert levels.index(with_camera.level) >= levels.index(without_camera.level)
