#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${GUARDCLAW_API_BASE_URL:-http://localhost:8000}"

curl -sS -X POST "${API_BASE_URL%/}/api/simulate/event" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "ipaws",
    "live": false,
    "location_label": "Cal Poly, San Luis Obispo, CA",
    "include_camera": true,
    "camera_scenario": "front_walkway",
    "demo_scenario": "cal_poly_ipaws_school_shelter"
  }'

printf '\n\nTriggered Cal Poly IPAWS shelter-in-place replay through %s/api/simulate/event\n' "${API_BASE_URL%/}"
