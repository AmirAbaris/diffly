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
    elif [ -x "/Users/amirabaris/Documents/diffly/.venv/bin/$name" ]; then
        echo "/Users/amirabaris/Documents/diffly/.venv/bin/$name"
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
    *)
        echo "Unknown feature '$FEATURE'. Options: health, auth-isolation, challenge-ownership, formatting, gemini-live" >&2
        exit 1
        ;;
esac
