#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
SKILL_DIR="$REPO_ROOT/.agents/skills/verify-diffly"
PID_DIR="$SKILL_DIR/.pids"
SCREENSHOT_ROOT="$SKILL_DIR/.screenshots"
EVIDENCE_DIR="$SKILL_DIR/evidence"

SCREENSHOTS_ONLY=0
for arg in "$@"; do
    case "$arg" in
        --screenshots-only)
            SCREENSHOTS_ONLY=1
            ;;
        *)
            echo "Unknown option '$arg'. Supported: --screenshots-only" >&2
            exit 1
            ;;
    esac
done

clean_screenshots() {
    if [ -d "$SCREENSHOT_ROOT" ]; then
        rm -rf "$SCREENSHOT_ROOT"
    fi
    if [ -d "$EVIDENCE_DIR" ]; then
        find "$EVIDENCE_DIR" -type f \( \
            -iname "*.png" -o \
            -iname "*.jpg" -o \
            -iname "*.jpeg" -o \
            -iname "*.webp" -o \
            -iname "*.gif" \
        \) -delete
    fi
}

if [ "$SCREENSHOTS_ONLY" -eq 1 ]; then
    echo "==> Cleaning transient verification screenshots..."
    clean_screenshots
    echo "Screenshot cleanup complete. Preserving structured evidence (.json/.txt) and running processes."
    exit 0
fi

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

clean_screenshots

echo "Teardown complete. Transient screenshots removed; structured evidence (.json/.txt) preserved."
