# Diffly Feature Map

This directory documents the active features of **Diffly**.

## Index of Features

| Feature                                                         | Surface                                                                   | Description                                                                   | Proven In                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------- |
| [System Health & Readiness](system-health.md)                   | REST API (`/api/health`)                                                  | Verifies service liveness and seeded challenge readiness                      | `scripts/drive.sh health`              |
| [Auth & Session Isolation](auth-and-session-isolation.md)       | REST API (`/api/auth/*`, `/api/challenges/*`, `/api/user/*`)              | Verifies cookie auth, guest/user isolation, claim-on-register, and revocation | `scripts/drive.sh auth-isolation`      |
| [Custom Challenge Ownership](custom-challenge-ownership.md)     | REST API (`/api/challenges/custom*`, `/api/challenges/{slug}/*`)          | Verifies owner-only CRUD, review, hints, solution, and deletion boundaries    | `scripts/drive.sh challenge-ownership` |
| [Visual Review](visual-review.md)                               | Next.js UI + Headless Chrome CDP                                          | Captures desktop/mobile PNGs, overflow, overlays, and fresh-agent audit       | `scripts/drive.sh visual`              |
| [Strict Code Hygiene & Spacing](code-hygiene-and-formatting.md) | Multi-tier Linter & CI (Ruff + Oxlint + React Doctor + ESLint + Prettier) | Enforces PEP 8 spacing, React best practices, and CI hygiene only             | `scripts/drive.sh formatting`          |

## Verification Guidance

1. Always run `.agents/skills/verify-diffly/scripts/doctor.sh` before driving features.
2. Every drive captures dated evidence in `.agents/skills/verify-diffly/evidence/`.
3. Proof artifacts survive `.agents/skills/verify-diffly/scripts/cleanup.sh`.
4. `scripts/drive.sh formatting` checks code hygiene only; drive `auth-isolation`, `challenge-ownership`, and `visual` to verify runtime behavior.
5. `visual` captures must be judged by a fresh agent that did not author the UI change using the checklist in [Visual Review](visual-review.md).
