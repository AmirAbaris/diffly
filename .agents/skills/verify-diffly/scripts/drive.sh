#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
EVIDENCE_DIR="$REPO_ROOT/.agents/skills/verify-diffly/evidence"
mkdir -p "$EVIDENCE_DIR"

FEATURE="${1:-health}"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")

case "$FEATURE" in
    health)
        echo "==> Driving Feature: System Health & Readiness"
        OUT="$EVIDENCE_DIR/${TIMESTAMP}_health.json"
        curl -s "http://127.0.0.1:8000/api/health" | tee "$OUT"
        echo ""
        echo "Evidence recorded to $OUT"
        ;;
    formatting)
        echo "==> Driving Feature: Strict Code Hygiene & Formatting Verification"
        OUT="$EVIDENCE_DIR/${TIMESTAMP}_formatting.txt"
        {
            echo "=== Ruff Check ==="
            if [ -x "$REPO_ROOT/.venv/bin/ruff" ]; then
                "$REPO_ROOT/.venv/bin/ruff" check "$REPO_ROOT/api" "$REPO_ROOT/backend" "$REPO_ROOT/tests"
            else
                ruff check "$REPO_ROOT/api" "$REPO_ROOT/backend" "$REPO_ROOT/tests"
            fi
            echo "=== Ruff Format Check ==="
            if [ -x "$REPO_ROOT/.venv/bin/ruff" ]; then
                "$REPO_ROOT/.venv/bin/ruff" format --check "$REPO_ROOT/api" "$REPO_ROOT/backend" "$REPO_ROOT/tests"
            else
                ruff format --check "$REPO_ROOT/api" "$REPO_ROOT/backend" "$REPO_ROOT/tests"
            fi
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

        PYTHON_BIN="$REPO_ROOT/.venv/bin/python"
        if [ ! -x "$PYTHON_BIN" ]; then
            PYTHON_BIN="python3"
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
        echo "Unknown feature '$FEATURE'. Options: health, formatting, gemini-live" >&2
        exit 1
        ;;
esac
