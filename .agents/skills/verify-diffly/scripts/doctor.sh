#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PID_DIR="$REPO_ROOT/.agents/skills/verify-diffly/.pids"
PID_FILE="$PID_DIR/backend.pid"
PORT_FILE="$PID_DIR/backend.port"
DB_FILE="$PID_DIR/backend.db_url"

echo "==> Running Doctor check on Diffly..."

if [ ! -f "$PID_FILE" ]; then
    echo "DOCTOR FAIL: No PID file found at $PID_FILE. Run launch.sh first." >&2
    exit 1
fi

PID="$(cat "$PID_FILE")"
if ! kill -0 "$PID" 2>/dev/null; then
    echo "DOCTOR FAIL: Process $PID is not running." >&2
    exit 1
fi

PORT="8000"
if [ -f "$PORT_FILE" ]; then
    PORT="$(cat "$PORT_FILE")"
fi

if command -v lsof >/dev/null 2>&1; then
    LISTEN_PIDS="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)"
    if [ -n "$LISTEN_PIDS" ] && ! echo "$LISTEN_PIDS" | grep -qx "$PID"; then
        echo "DOCTOR FAIL: Port $PORT is not owned by PID $PID (owned by: $LISTEN_PIDS)." >&2
        exit 1
    fi
fi

if [ -f "$DB_FILE" ]; then
    DB_URL="$(cat "$DB_FILE")"
    if [[ "$DB_URL" == *"diffly.db" ]] && [[ "$DB_URL" != *"diffly-verify-"* ]]; then
        echo "DOCTOR FAIL: Backend is pointing at non-isolated DB ($DB_URL)." >&2
        exit 1
    fi
else
    DB_URL="unknown"
fi

HEALTH_RESPONSE="$(curl -s "http://127.0.0.1:$PORT/api/health" || echo "")"
if [[ "$HEALTH_RESPONSE" != *"\"status\":\"healthy\""* ]] && [[ "$HEALTH_RESPONSE" != *"\"status\": \"healthy\""* ]]; then
    echo "DOCTOR FAIL: Health endpoint on port $PORT did not return healthy. Response: $HEALTH_RESPONSE" >&2
    exit 1
fi

if [[ "$HEALTH_RESPONSE" != *"diffly-fastapi"* ]]; then
    echo "DOCTOR FAIL: Unexpected service identity on port $PORT. Response: $HEALTH_RESPONSE" >&2
    exit 1
fi

echo "DOCTOR PASS: Diffly backend healthy at http://127.0.0.1:$PORT (PID: $PID, DB: $DB_URL)."
exit 0
