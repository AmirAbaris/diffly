#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PID_DIR="$REPO_ROOT/.agents/skills/verify-diffly/.pids"
LOG_DIR="$REPO_ROOT/.agents/skills/verify-diffly/.logs"
mkdir -p "$PID_DIR" "$LOG_DIR"

echo "==> Preparing database..."
cd "$REPO_ROOT"
export PYTHONPATH="$REPO_ROOT"

if [ -f "$REPO_ROOT/.venv/bin/activate" ]; then
    # shellcheck disable=SC1091
    source "$REPO_ROOT/.venv/bin/activate"
fi

python3 "$REPO_ROOT/backend/seed.py"

echo "==> Launching FastAPI backend server on port 8000..."
uvicorn api.index:app --host 127.0.0.1 --port 8000 > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$PID_DIR/backend.pid"

# Wait for server readiness
READY=0
for i in {1..30}; do
    if curl -s -f "http://127.0.0.1:8000/api/health" > /dev/null 2>&1; then
        READY=1
        break
    fi
    sleep 0.5
done

if [ "$READY" -eq 1 ]; then
    echo "==> Backend is ready at http://127.0.0.1:8000 (PID: $BACKEND_PID)"
    exit 0
else
    echo "ERROR: Server failed to become ready in 15 seconds. Check logs at $LOG_DIR/backend.log" >&2
    exit 1
fi
