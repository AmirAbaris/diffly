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
            echo "=== ESLint Check ==="
            pnpm --prefix "$REPO_ROOT" lint:js
        } > "$OUT" 2>&1
        cat "$OUT"
        echo "Evidence recorded to $OUT"
        ;;
    *)
        echo "Unknown feature '$FEATURE'. Options: health, formatting" >&2
        exit 1
        ;;
esac
