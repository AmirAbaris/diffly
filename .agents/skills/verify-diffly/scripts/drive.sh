#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
EVIDENCE_DIR="$REPO_ROOT/.agents/skills/verify-diffly/evidence"
mkdir -p "$EVIDENCE_DIR"

FEATURE="${1:-review}"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")

case "$FEATURE" in
    health)
        echo "==> Driving Feature: System Health & Readiness"
        OUT="$EVIDENCE_DIR/${TIMESTAMP}_health.json"
        curl -s "http://127.0.0.1:8000/api/health" | tee "$OUT"
        echo ""
        echo "Evidence recorded to $OUT"
        ;;
    catalog)
        echo "==> Driving Feature: Challenge Catalog"
        OUT="$EVIDENCE_DIR/${TIMESTAMP}_challenges.json"
        curl -s "http://127.0.0.1:8000/api/challenges" | tee "$OUT"
        echo ""
        echo "Evidence recorded to $OUT"
        ;;
    review)
        echo "==> Driving Feature: Code Review Evaluation (Agent Code Defect)"
        OUT="$EVIDENCE_DIR/${TIMESTAMP}_review_eval.json"
        # Driving Challenge 1 (eval RCE at line 5)
        PAYLOAD='{"flagged_lines": [5], "comments": "Line 5 uses eval directly, causing Remote Code Execution (RCE) on user input."}'
        RESPONSE=$(curl -s -X POST "http://127.0.0.1:8000/api/challenges/1/review" \
            -H "Content-Type: application/json" \
            -d "$PAYLOAD")
        echo "$RESPONSE" | tee "$OUT"
        echo ""
        # Assert expected score in evidence
        if [[ "$RESPONSE" == *"100"* ]] && [[ "$RESPONSE" == *"Outstanding review"* ]]; then
            echo "VERIFICATION SUCCESS: Perfect 100 score achieved for valid RCE review."
        else
            echo "VERIFICATION FAIL: Unexpected review scoring response: $RESPONSE" >&2
            exit 1
        fi
        echo "Evidence recorded to $OUT"
        ;;
    formatting)
        echo "==> Driving Feature: Strict Code Hygiene & Formatting Verification"
        OUT="$EVIDENCE_DIR/${TIMESTAMP}_formatting.txt"
        {
            echo "=== Ruff Check ==="
            "$REPO_ROOT/.venv/bin/ruff" check "$REPO_ROOT/api" "$REPO_ROOT/backend" "$REPO_ROOT/tests"
            echo "=== Ruff Format Check ==="
            "$REPO_ROOT/.venv/bin/ruff" format --check "$REPO_ROOT/api" "$REPO_ROOT/backend" "$REPO_ROOT/tests"
            echo "=== Prettier Check ==="
            pnpm --prefix "$REPO_ROOT" format:check
            echo "=== ESLint Check ==="
            pnpm --prefix "$REPO_ROOT" lint:js
        } > "$OUT" 2>&1
        cat "$OUT"
        echo "Evidence recorded to $OUT"
        ;;
    *)
        echo "Unknown feature '$FEATURE'. Options: health, catalog, review, formatting" >&2
        exit 1
        ;;
esac
