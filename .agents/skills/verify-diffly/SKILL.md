---
name: verify-diffly
description: "Verify the Diffly platform baseline (FastAPI backend + Next.js frontend). Launch, doctor, drive features, and capture proof."
disable-model-invocation: true
---

# Verify Diffly

This skill verifies the **Diffly** codebase.

The stack comprises:

- **Backend:** FastAPI with modular architecture scaffold and isolated SQLite verification databases.
- **Frontend:** Next.js (App Router), shadcn/ui components, SWR, Axios, Tailwind CSS.
- **Code Quality:** Strict PEP 8 function spacing (Ruff E302/E305), Prettier, Oxlint fast checks, React Doctor best practices, ESLint `padding-line-between-statements`, and GitHub Actions CI.

## Launch

Start the FastAPI backend server for verification using the launch helper:

```bash
.agents/skills/verify-diffly/scripts/launch.sh
```

**Ready criteria:**

- Server listens on `http://127.0.0.1:$PORT` (`8000` when free, or an available ephemeral port unless `PORT` is set).
- Uses an isolated throwaway SQLite DB (`diffly_verify.db` in a temporary directory) so developer state in `diffly.db` is never mutated.
- `GET /api/health` returns HTTP 200 with `status: "healthy"` and seeded challenges present.
- Runtime state is recorded at `.agents/skills/verify-diffly/.pids/backend.{pid,port,db_url,tmp_dir}`.

For fullstack visual verification, `scripts/drive.sh visual` launches Next.js automatically against the active backend port and shuts it down on exit.

## Doctor

Before driving features or when anything fails, run the read-only doctor check:

```bash
.agents/skills/verify-diffly/scripts/doctor.sh
```

The doctor verifies:

1. Backend PID is alive and owns the recorded port.
2. Recorded `DATABASE_URL` points to the isolated verification directory rather than a dev DB.
3. `/api/health` responds with `healthy` status.

## Drive

Drive active features using the drive script:

```bash
# Drive system health check
.agents/skills/verify-diffly/scripts/drive.sh health

# Drive live auth, cookie lifecycle, and session isolation checks
.agents/skills/verify-diffly/scripts/drive.sh auth-isolation

# Drive live custom challenge CRUD and ownership boundary checks
.agents/skills/verify-diffly/scripts/drive.sh challenge-ownership

# Drive live Next.js + headless Chrome visual capture across desktop and mobile
.agents/skills/verify-diffly/scripts/drive.sh visual

# Telemetry-only visual run (deletes transient PNGs immediately on exit)
.agents/skills/verify-diffly/scripts/drive.sh visual --ephemeral

# Drive strict code hygiene and formatting checks (hygiene only, not runtime behavior)
.agents/skills/verify-diffly/scripts/drive.sh formatting

# Drive live Google Gemini BYOK generation (requires GEMINI_API_KEY)
GEMINI_API_KEY='...' .agents/skills/verify-diffly/scripts/drive.sh gemini-live
```

See the [Feature Map](features/README.md) for detailed feature guides and judging criteria.

## Claim vocabulary

Use these exact status labels when reporting verification results:

- `VERIFIED LIVE`: Exercised end-to-end against a running FastAPI backend and/or Next.js frontend with artifacts recorded in `evidence/`.
- `UNTESTED`: Not exercised live (for example, `gemini-live` when `GEMINI_API_KEY` is absent, or `visual` when Chrome is unavailable). State the exact gap and reason.
- `FAILED`: Live probe exited non-zero, failed an assertion, hit a Next.js error overlay, or surfaced unexpected runtime/layout failures.

Never claim `VERIFIED LIVE` from unit tests, mocks, type-checks, or linters alone.

## When verification is mandatory

- **Backend changes (`api/`, `backend/`):** Launch the isolated backend (`scripts/launch.sh` + `scripts/doctor.sh`) and drive `auth-isolation` and `challenge-ownership` live before finishing.
- **Frontend or UI changes (`app/`, `components/`, `hooks/`, stylesheets):** Drive `visual` live and have a **fresh agent that did not author the UI change** judge the captured PNGs in `.screenshots/<TIMESTAMP>/` and `evidence/<TIMESTAMP>_visual.json` manifest against [Visual Review](features/visual-review.md). Run `scripts/cleanup.sh` (or `--screenshots-only`) after the audit completes.
- **Hygiene vs. behavior:** `scripts/drive.sh formatting` proves code hygiene only (lint, types, formatting, React Doctor). It never proves auth isolation, challenge ownership, runtime rendering, or visual layout.
- **External integrations:** Never rely solely on mocked unit tests for third-party APIs or auth boundaries. Run `gemini-live` when `GEMINI_API_KEY` is configured, and explicitly report `Live Provider Verification: UNTESTED (credentials not configured)` when it is not.

## Evidence

Every drive captures structured proof stored in:
`.agents/skills/verify-diffly/evidence/<TIMESTAMP>_<FEATURE>.[json|txt]`

Visual drives capture transient PNGs to `.agents/skills/verify-diffly/.screenshots/<TIMESTAMP>/` (gitignored) and record the manifest to `evidence/<TIMESTAMP>_visual.json`.

## Cleanup

Tear down background processes, temporary databases, and transient screenshots while preserving structured `.json` and `.txt` files in `evidence/`:

```bash
.agents/skills/verify-diffly/scripts/cleanup.sh
```

To delete transient screenshots only without stopping running servers (useful right after a fresh-agent visual audit):

```bash
.agents/skills/verify-diffly/scripts/cleanup.sh --screenshots-only
```

## Helpers

All helper scripts live in `.agents/skills/verify-diffly/scripts/` and are executable:

- `scripts/launch.sh`: Starts the FastAPI backend on an isolated throwaway SQLite DB and awaits readiness.
- `scripts/doctor.sh`: Read-only process, port, isolated DB, and health check.
- `scripts/drive.sh`: Exercises `health`, `auth-isolation`, `challenge-ownership`, `visual`, `formatting`, and `gemini-live` and records evidence.
- `scripts/cleanup.sh`: Terminates verification servers by PID, deletes temporary databases and transient `.screenshots/` (and any stray images in `evidence/`), while keeping structured `.json`/`.txt` evidence. Supports `--screenshots-only`.
- `scripts/verify_auth_and_ownership.py`: Python `httpx` driver for live cookie auth, session isolation, production header forgery rejection, and custom challenge ownership gates.
- `scripts/capture_visual.mjs`: Node headless Chrome CDP driver for desktop and mobile screenshots (into `.screenshots/<TIMESTAMP>/` unless `--screenshot-dir` is set, with `--ephemeral` for telemetry-only runs) plus overflow, Next.js overlay, and console error telemetry.
