---
description: Git workflow rules for all agents and subagents (never push directly to main)
trigger: always_on
---

# Git Workflow & Branch Protection

- **Never push directly to `main`.** This applies to the main agent, every subagent, and any script or automation unless the user explicitly approves pushing to `main` in the current conversation.
- **Always use a feature branch or worktree.** Branch off `main`, commit changes on the branch, push the branch, and open a pull request.
- **Never bypass the `pre-push` hook.** Do not pass `--no-verify` or set `ALLOW_PUSH_MAIN=1` unless the user explicitly instructs you to push to `main`.
