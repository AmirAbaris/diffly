#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
COMMON_ROOT="$(cd "$(git -C "$REPO_ROOT" rev-parse --git-common-dir 2>/dev/null || echo "$REPO_ROOT/.git")/.." && pwd)"
PID_DIR="$REPO_ROOT/.agents/skills/verify-diffly/.pids"
LOG_DIR="$REPO_ROOT/.agents/skills/verify-diffly/.logs"
mkdir -p "$PID_DIR" "$LOG_DIR"

resolve_bin() {
    local name="$1"
    if [ -x "$REPO_ROOT/.venv/bin/$name" ]; then
        echo "$REPO_ROOT/.venv/bin/$name"
    elif [ -x "$COMMON_ROOT/.venv/bin/$name" ]; then
        echo "$COMMON_ROOT/.venv/bin/$name"
    elif [ -x "/Users/amirabaris/Documents/diffly/.venv/bin/$name" ]; then
        echo "/Users/amirabaris/Documents/diffly/.venv/bin/$name"
    elif command -v "$name" >/dev/null 2>&1; then
        command -v "$name"
    else
        return 1
    fi
}

PYTHON_BIN="$(resolve_bin python)" || {
    echo "ERROR: Python binary not found in .venv or PATH." >&2
    exit 1
}
UVICORN_BIN="$(resolve_bin uvicorn)" || {
    echo "ERROR: uvicorn binary not found in .venv or PATH." >&2
    exit 1
}

if [ -f "$PID_DIR/backend.pid" ]; then
    EXISTING_PID="$(cat "$PID_DIR/backend.pid")"
    if kill -0 "$EXISTING_PID" 2>/dev/null; then
        echo "ERROR: Backend is already running (PID: $EXISTING_PID). Run cleanup.sh first." >&2
        exit 1
    fi
    rm -f "$PID_DIR/backend.pid" "$PID_DIR/backend.port" "$PID_DIR/backend.db_url"
fi

SELECTED_PORT="$("$PYTHON_BIN" -c '
import os, socket, sys

requested = os.environ.get("PORT", "").strip()
if requested:
    port = int(requested)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            print(f"BUSY:{port}", file=sys.stderr)
            sys.exit(1)
    print(port)
else:
    for candidate in (8000, 0):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind(("127.0.0.1", candidate))
                print(sock.getsockname()[1])
                sys.exit(0)
            except OSError:
                continue
    sys.exit(1)
')" || {
    echo "ERROR: Unable to acquire a free port for the backend." >&2
    exit 1
}

VERIFY_TMP_DIR=""
if [ -z "${DATABASE_URL:-}" ]; then
    VERIFY_TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/diffly-verify-XXXXXX")"
    export DATABASE_URL="sqlite:///$VERIFY_TMP_DIR/diffly_verify.db"
    echo "$VERIFY_TMP_DIR" > "$PID_DIR/backend.tmp_dir"
fi

export ENVIRONMENT="${ENVIRONMENT:-development}"
export PYTHONPATH="$REPO_ROOT"

cd "$REPO_ROOT"

echo "==> Launching FastAPI backend on http://127.0.0.1:$SELECTED_PORT with isolated DB..."
"$UVICORN_BIN" api.index:app --host 127.0.0.1 --port "$SELECTED_PORT" > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

echo "$BACKEND_PID" > "$PID_DIR/backend.pid"
echo "$SELECTED_PORT" > "$PID_DIR/backend.port"
echo "$DATABASE_URL" > "$PID_DIR/backend.db_url"

READY=0
for _ in {1..30}; do
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        break
    fi
    if curl -s -f "http://127.0.0.1:$SELECTED_PORT/api/health" | "$PYTHON_BIN" -c '
import json, sys
data = json.load(sys.stdin)
sys.exit(0 if data.get("status") == "healthy" and data.get("challenge_count", 0) > 0 else 1)
' 2>/dev/null; then
        READY=1
        break
    fi
    sleep 0.5
done

if [ "$READY" -eq 1 ]; then
    echo "==> Backend ready at http://127.0.0.1:$SELECTED_PORT (PID: $BACKEND_PID, DB: $DATABASE_URL)"
    exit 0
fi

echo "ERROR: Backend failed readiness check on port $SELECTED_PORT." >&2
if [ -f "$LOG_DIR/backend.log" ]; then
    tail -n 30 "$LOG_DIR/backend.log" >&2 || true
fi
kill "$BACKEND_PID" 2>/dev/null || true
rm -f "$PID_DIR/backend.pid" "$PID_DIR/backend.port" "$PID_DIR/backend.db_url" "$PID_DIR/backend.tmp_dir"
if [ -n "$VERIFY_TMP_DIR" ] && [ -d "$VERIFY_TMP_DIR" ]; then
    rm -rf "$VERIFY_TMP_DIR"
fi
exit 1
