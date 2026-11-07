#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PID_FILE="$REPO_ROOT/.agents/skills/verify-diffly/.pids/backend.pid"

echo "==> Tearing down Diffly verification instances..."

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "Stopping backend process (PID: $PID)..."
        kill "$PID" || true
        # Wait up to 5 seconds for clean exit
        for _ in {1..10}; do
            if ! kill -0 "$PID" 2>/dev/null; then
                break
            fi
            sleep 0.5
        done
        # Force kill if still lingering
        if kill -0 "$PID" 2>/dev/null; then
            kill -9 "$PID" || true
        fi
    fi
    rm -f "$PID_FILE"
fi

echo "Teardown complete. Preserving evidence directory."
