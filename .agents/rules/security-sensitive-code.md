---
description: Security, authentication, authorization, ownership, and data-isolation gates for backend routes, dependencies, models, and services
trigger: glob
globs: "**/api/deps.py, **/api/routes/**, **/api/index.py, **/backend/core/**, **/backend/models/**, **/backend/services/**"
---

# Security-Sensitive Code

Follow these rules for every change touching auth, dependencies, routes, models, or backend services.

## Pre-Coding Design Check

1. Write an explicit abuse-case list before editing code: who can call this endpoint or service and read or write someone else's data as an anonymous caller, a guest session, another user, or an inactive user.
2. Name the data owner for every resource read or mutated (user ID, guest session ID, or public catalog).

## Models and Adversarial Review

- Use `pro` models for both the implementer and reviewers on security-sensitive changes.
- Run `/interrogate` on the full diff before opening or updating a PR.
- Treat security-bot and automated review findings as `ask` by default, never silent dismiss (follow pstack `bugbot-triage`).

## Verification and Reporting

- Cover every affected endpoint and caller role in `tests/test_authorization_matrix.py`.
- Run both `auth-isolation` and `challenge-ownership` drives via `.agents/skills/verify-diffly` against a live server.
- A fresh agent (not the author) must execute and sign off on the verification run.
- Report verification status using `VERIFIED LIVE`, `UNTESTED`, or `FAILED`. Never claim work is verified from unit tests alone.
