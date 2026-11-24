# Diffly Feature Map

This directory documents the active features of **Diffly**.

## Index of Features

| Feature                                                         | Surface                                                                   | Description                                                                             | Proven In                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| [System Health & Readiness](system-health.md)                   | REST API (`/api/health`)                                                  | Verifies service liveness, DB connectivity, seeded count, and 503 failure mode          | `scripts/drive.sh health`                    |
| [Auth & Session Isolation](auth-and-session-isolation.md)       | REST API (`/api/auth/*`, `/api/challenges/*`, `/api/user/*`, `/api/ai/*`) | Verifies cookie/Bearer auth, guest/user isolation, OAuth, coach patterns, and BYOK seal | `scripts/drive.sh auth-isolation`            |
| [Custom Challenge Ownership](custom-challenge-ownership.md)     | REST API (`/api/challenges/custom*`, `/api/challenges/{slug}/*`, `/next`) | Verifies owner-only CRUD, unlisted share tokens, hints/solution/review, and deletion    | `scripts/drive.sh challenge-ownership`       |
| [Agent Coach & BYOK AI](agent-coach-and-byok-ai.md)             | Next.js (`/coach`, `/settings`, `/api/coach`, `/api/ai/*`) + FastAPI      | Verifies sealed BYOK cookie boundaries, coach-patterns isolation, and Coach UI          | `scripts/drive.sh visual` + `auth-isolation` |
| [Visual Review](visual-review.md)                               | Next.js UI + Headless Chrome CDP                                          | Captures desktop/mobile PNGs across 8 states, overflow, overlays, and fresh-agent audit | `scripts/drive.sh visual`                    |
| [Strict Code Hygiene & Spacing](code-hygiene-and-formatting.md) | Multi-tier Linter & CI (Ruff + Oxlint + React Doctor + ESLint + Prettier) | Enforces PEP 8 spacing, color tokens, React best practices, typecheck, and CI hygiene   | `scripts/drive.sh formatting`                |

## Verification Guidance

1. Always run `.agents/skills/verify-diffly/scripts/doctor.sh` before driving features.
2. Every drive captures structured `.json`/`.txt` evidence in `.agents/skills/verify-diffly/evidence/`. `drive.sh visual` captures transient PNGs to `.agents/skills/verify-diffly/.screenshots/<TIMESTAMP>/` (gitignored) and writes the manifest to `evidence/<TIMESTAMP>_visual.json` (pass `--ephemeral` for telemetry-only runs).
3. Structured `.json`/`.txt` evidence survives `.agents/skills/verify-diffly/scripts/cleanup.sh`, while `cleanup.sh` (or `cleanup.sh --screenshots-only`) deletes all transient screenshots once the audit completes.
4. `scripts/drive.sh formatting` checks code hygiene only; drive `auth-isolation`, `challenge-ownership`, and `visual` to verify runtime behavior.
5. `visual` captures must be judged by a fresh agent that did not author the UI change using the checklist in [Visual Review](visual-review.md).
