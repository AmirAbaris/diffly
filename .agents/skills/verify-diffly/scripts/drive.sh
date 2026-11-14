#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
COMMON_ROOT="$(cd "$(git -C "$REPO_ROOT" rev-parse --git-common-dir 2>/dev/null || echo "$REPO_ROOT/.git")/.." && pwd)"
PID_DIR="$REPO_ROOT/.agents/skills/verify-diffly/.pids"
EVIDENCE_DIR="$REPO_ROOT/.agents/skills/verify-diffly/evidence"
mkdir -p "$EVIDENCE_DIR"

resolve_bin() {
    local name="$1"
    if [ -x "$REPO_ROOT/.venv/bin/$name" ]; then
        echo "$REPO_ROOT/.venv/bin/$name"
    elif [ -x "$COMMON_ROOT/.venv/bin/$name" ]; then
        echo "$COMMON_ROOT/.venv/bin/$name"
    elif command -v "$name" >/dev/null 2>&1; then
        command -v "$name"
    else
        return 1
    fi
}

PYTHON_BIN="$(resolve_bin python || command -v python3)"
PORT="8000"
if [ -f "$PID_DIR/backend.port" ]; then
    PORT="$(cat "$PID_DIR/backend.port")"
fi
BASE_URL="http://127.0.0.1:$PORT"

FEATURE="${1:-health}"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"

case "$FEATURE" in
    health)
        echo "==> Driving Feature: System Health & Readiness ($BASE_URL)"
        OUT="$EVIDENCE_DIR/${TIMESTAMP}_health.json"
        curl -s -f "$BASE_URL/api/health" | tee "$OUT"
        echo ""
        echo "Evidence recorded to $OUT"
        ;;
    auth-isolation)
        echo "==> Driving Feature: Auth & Session Isolation ($BASE_URL)"
        OUT="$EVIDENCE_DIR/${TIMESTAMP}_auth-isolation.json"
        "$PYTHON_BIN" "$SCRIPT_DIR/verify_auth_and_ownership.py" \
            --feature auth-isolation \
            --base-url "$BASE_URL" \
            --evidence-out "$OUT"
        ;;
    challenge-ownership)
        echo "==> Driving Feature: Custom Challenge Ownership ($BASE_URL)"
        OUT="$EVIDENCE_DIR/${TIMESTAMP}_challenge-ownership.json"
        "$PYTHON_BIN" "$SCRIPT_DIR/verify_auth_and_ownership.py" \
            --feature challenge-ownership \
            --base-url "$BASE_URL" \
            --evidence-out "$OUT"
        ;;
    formatting)
        echo "==> Driving Feature: Strict Code Hygiene & Formatting Verification"
        OUT="$EVIDENCE_DIR/${TIMESTAMP}_formatting.txt"
        RUFF_BIN="$(resolve_bin ruff)"
        {
            echo "=== Ruff Check ==="
            "$RUFF_BIN" check "$REPO_ROOT/api" "$REPO_ROOT/backend" "$REPO_ROOT/tests"
            echo "=== Ruff Format Check ==="
            "$RUFF_BIN" format --check "$REPO_ROOT/api" "$REPO_ROOT/backend" "$REPO_ROOT/tests"
            echo "=== Prettier Check ==="
            pnpm --prefix "$REPO_ROOT" format:check
            echo "=== Oxlint Check ==="
            pnpm --prefix "$REPO_ROOT" lint:oxlint
            echo "=== React Doctor Check ==="
            pnpm --prefix "$REPO_ROOT" lint:doctor
            echo "=== ESLint Check ==="
            pnpm --prefix "$REPO_ROOT" lint:js
            echo "=== TypeScript Check ==="
            pnpm --prefix "$REPO_ROOT" typecheck
        } > "$OUT" 2>&1
        cat "$OUT"
        echo "Evidence recorded to $OUT"
        ;;
    gemini-live)
        echo "==> Driving Feature: Live Google Gemini API Integration & Structured Challenge Output"
        OUT="$EVIDENCE_DIR/${TIMESTAMP}_gemini_live.json"
        if [ -z "${GEMINI_API_KEY:-}" ]; then
            echo "ERROR: GEMINI_API_KEY environment variable is not set." >&2
            echo "Provide a key via GEMINI_API_KEY='...' .agents/skills/verify-diffly/scripts/drive.sh gemini-live" >&2
            exit 1
        fi

        "$PYTHON_BIN" -c "
import asyncio, json, os, sys
sys.path.insert(0, '$REPO_ROOT')
from backend.models.challenge import Difficulty, GenerateCustomChallengeRequest, Language
from backend.services.gemini_generator import generate_custom_challenge

async def run():
    req = GenerateCustomChallengeRequest(
        topic='Next.js Server Actions IDOR vulnerability',
        language=Language.TYPESCRIPT,
        difficulty=Difficulty.MEDIUM,
    )
    res = await generate_custom_challenge(req, os.environ['GEMINI_API_KEY'])
    data = res.model_dump()
    with open('$OUT', 'w') as f:
        json.dump(data, f, indent=2, default=str)
    print(f'SUCCESS: Generated \"{res.title}\" ({res.line_count} lines) with {len(res.expected_issues)} defect(s).')

asyncio.run(run())
"
        echo "Evidence recorded to $OUT"
        ;;
    visual)
        echo "==> Driving Feature: Visual Review & Responsive Screenshot Capture"
        if [ ! -f "$PID_DIR/backend.pid" ] || ! kill -0 "$(cat "$PID_DIR/backend.pid")" 2>/dev/null; then
            echo "ERROR: Backend is not running. Run launch.sh and doctor.sh first." >&2
            exit 1
        fi
        NEXT_BIN="$REPO_ROOT/node_modules/.bin/next"
        if [ ! -x "$NEXT_BIN" ]; then
            echo "ERROR: $NEXT_BIN not found. Run pnpm install before driving visual." >&2
            exit 1
        fi
        if ! command -v node >/dev/null 2>&1; then
            echo "ERROR: node binary not found in PATH." >&2
            exit 1
        fi

        FRONTEND_PORT="$("$PYTHON_BIN" -c '
import os, socket, sys

requested = os.environ.get("FRONTEND_PORT", "").strip()
candidates = [int(requested)] if requested else [3000, 0]
for candidate in candidates:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(("127.0.0.1", candidate))
            print(sock.getsockname()[1])
            sys.exit(0)
        except OSError:
            continue
sys.exit(1)
')" || {
            echo "ERROR: Unable to acquire a free port for Next.js frontend." >&2
            exit 1
        }

        NEXT_ENV_CLEAN=0
        if git -C "$REPO_ROOT" diff --quiet -- next-env.d.ts 2>/dev/null; then
            NEXT_ENV_CLEAN=1
        fi

        FRONTEND_PID=""
        cleanup_visual() {
            if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
                kill "$FRONTEND_PID" 2>/dev/null || true
                for _ in {1..10}; do
                    if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
                        break
                    fi
                    sleep 0.5
                done
                if kill -0 "$FRONTEND_PID" 2>/dev/null; then
                    kill -9 "$FRONTEND_PID" 2>/dev/null || true
                fi
            fi
            rm -f "$PID_DIR/frontend.pid" "$PID_DIR/frontend.port"
            if [ "$NEXT_ENV_CLEAN" -eq 1 ]; then
                git -C "$REPO_ROOT" checkout -- next-env.d.ts 2>/dev/null || true
            fi
        }
        trap cleanup_visual EXIT

        LOG_DIR="$REPO_ROOT/.agents/skills/verify-diffly/.logs"
        mkdir -p "$LOG_DIR"
        BACKEND_URL="$BASE_URL" "$NEXT_BIN" dev -p "$FRONTEND_PORT" > "$LOG_DIR/frontend.log" 2>&1 &
        FRONTEND_PID=$!
        echo "$FRONTEND_PID" > "$PID_DIR/frontend.pid"
        echo "$FRONTEND_PORT" > "$PID_DIR/frontend.port"

        FRONTEND_READY=0
        for _ in {1..90}; do
            if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
                break
            fi
            if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$FRONTEND_PORT/" | grep -q "^200$"; then
                FRONTEND_READY=1
                break
            fi
            sleep 0.5
        done

        if [ "$FRONTEND_READY" -ne 1 ]; then
            echo "ERROR: Next.js frontend failed to become ready on port $FRONTEND_PORT." >&2
            tail -n 40 "$LOG_DIR/frontend.log" >&2 || true
            exit 1
        fi

        echo "==> Frontend ready at http://localhost:$FRONTEND_PORT (proxying /api to $BASE_URL)"
        node "$SCRIPT_DIR/capture_visual.mjs" \
            --base-url "http://localhost:$FRONTEND_PORT" \
            --evidence-dir "$EVIDENCE_DIR" \
            --timestamp "$TIMESTAMP"
        ;;
    *)
        echo "Unknown feature '$FEATURE'. Options: health, auth-isolation, challenge-ownership, visual, formatting, gemini-live" >&2
        exit 1
        ;;
esac
