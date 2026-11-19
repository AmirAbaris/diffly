#!/usr/bin/env bash
set -euo pipefail

if [ "${ALLOW_PUSH_MAIN:-0}" = "1" ]; then
  exit 0
fi

if [ -t 0 ]; then
  current_branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
  if [ "$current_branch" = "main" ]; then
    {
      echo "ERROR: Direct push to 'main' is blocked."
      echo "Create a feature branch and open a pull request instead."
      echo "If the user explicitly approved pushing to main, re-run with ALLOW_PUSH_MAIN=1."
    } >&2
    exit 1
  fi
  exit 0
fi

while IFS=' ' read -r _local_ref _local_sha remote_ref _remote_sha; do
  if [ "${remote_ref:-}" = "refs/heads/main" ]; then
    {
      echo "ERROR: Direct push to 'main' is blocked."
      echo "Create a feature branch and open a pull request instead."
      echo "If the user explicitly approved pushing to main, re-run with ALLOW_PUSH_MAIN=1."
    } >&2
    exit 1
  fi
done
