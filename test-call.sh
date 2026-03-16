#!/usr/bin/env bash
set -euo pipefail

BRIDGE_URL="${BRIDGE_URL:-http://localhost:8083}"

curl -s -X POST "${BRIDGE_URL}/api/call" \
  -H "Content-Type: application/json" \
  -d '{
    "sip_endpoint": "user/1001",
    "scenario": "leadgenTNDS",
    "custom_data": {
      "leadId": "LEAD-001",
      "gender": "Anh",
      "name": "Minh"
    }
  }' | jq .
