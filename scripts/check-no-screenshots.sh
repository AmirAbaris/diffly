#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FILES="$(
  {
    git -c core.quotePath=false -C "$REPO_ROOT" ls-files
    git -c core.quotePath=false -C "$REPO_ROOT" diff --cached --name-only --diff-filter=ACMR
  } | sort -u
)"

OFFENDING="$(
  printf '%s\n' "$FILES" | grep -iE \
    '(^\.(agents|cursor|gemini)/.*\.(png|jpe?g|webp|gif)$)|((^|/)(.*screenshot.*|.*_visual_.*)\.(png|jpe?g|webp|gif)$)' \
    || true
)"

if [ -n "$OFFENDING" ]; then
  {
    echo "ERROR: Verification or screenshot image files are tracked or staged for commit:"
    printf '%s\n' "$OFFENDING" | sed 's/^/  /'
    echo ""
    echo "Remove these files from git (e.g. git rm --cached <path>) or run:"
    echo "  .agents/skills/verify-diffly/scripts/cleanup.sh --screenshots-only"
  } >&2
  exit 1
fi

echo "No tracked or staged verification screenshots found."
