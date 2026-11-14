#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PID_DIR="$REPO_ROOT/.agents/skills/verify-diffly/.pids"

echo "==> Tearing down Diffly verification instances..."

stop_pid_file() {
    local pid_file="$1"
    local label="$2"
    if [ -f "$pid_file" ]; then
        local pid
        pid="$(cat "$pid_file")"
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "Stopping $label process (PID: $pid)..."
            kill "$pid" 2>/dev/null || true
            for _ in {1..10}; do
                if ! kill -0 "$pid" 2>/dev/null; then
                    break
                fi
                sleep 0.5
            done
            if kill -0 "$pid" 2>/dev/null; then
                kill -9 "$pid" 2>/dev/null || true
            fi
        fi
        rm -f "$pid_file"
    fi
}

stop_pid_file "$PID_DIR/frontend.pid" "frontend"
stop_pid_file "$PID_DIR/backend.pid" "backend"

rm -f "$PID_DIR/backend.port" "$PID_DIR/backend.db_url" "$PID_DIR/frontend.port"

if [ -f "$PID_DIR/backend.tmp_dir" ]; then
    TMP_DIR_PATH="$(cat "$PID_DIR/backend.tmp_dir")"
    if [ -n "$TMP_DIR_PATH" ] && [[ "$TMP_DIR_PATH" == */diffly-verify-* ]] && [ -d "$TMP_DIR_PATH" ]; then
        rm -rf "$TMP_DIR_PATH"
    fi
    rm -f "$PID_DIR/backend.tmp_dir"
fi

echo "Teardown complete. Preserving evidence directory."
