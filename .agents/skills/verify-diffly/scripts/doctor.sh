#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PID_FILE="$REPO_ROOT/.agents/skills/verify-diffly/.pids/backend.pid"

echo "==> Running Doctor check on Diffly..."

# 1. Process Check
if [ ! -f "$PID_FILE" ]; then
    echo "DOCTOR FAIL: No PID file found at $PID_FILE. App may not be launched." >&2
    exit 1
fi

PID=$(cat "$PID_FILE")
if ! kill -0 "$PID" 2>/dev/null; then
    echo "DOCTOR FAIL: Process $PID is not running." >&2
    exit 1
fi

# 2. Health Endpoint Check
HEALTH_RESPONSE=$(curl -s "http://127.0.0.1:8000/api/health" || echo "")
if [[ "$HEALTH_RESPONSE" != *"healthy"* ]]; then
    echo "DOCTOR FAIL: Health endpoint did not return 'healthy'. Response: $HEALTH_RESPONSE" >&2
    exit 1
fi

echo "DOCTOR PASS: Diffly instance is healthy and ready to drive (PID: $PID)."
exit 0
