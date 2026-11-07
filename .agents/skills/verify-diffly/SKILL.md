---
name: verify-diffly
description: "Verify the Diffly code review platform (FastAPI backend + Next.js frontend + SQLModel database). Launch, doctor, drive challenges, and capture proof."
disable-model-invocation: true
---

# Verify Diffly

This skill verifies the **Diffly** codebase — the dev tool / arena for learning and testing code review skills on AI agent generated code and pull requests.

The stack comprises:

- **Backend:** FastAPI, SQLModel ORM, NeonDB (PostgreSQL) with SQLite local fallback.
- **Frontend:** Next.js (App Router), shadcn/ui components (`radix-maia` preset), Tailwind CSS.
- **Code Quality:** Strict PEP 8 function spacing (Ruff E302/E305), Prettier, ESLint `padding-line-between-statements`, and GitHub Actions CI.

## Launch

Start the FastAPI backend server for verification using the launch helper:

```bash
.agents/skills/verify-diffly/scripts/launch.sh
```

**Ready criteria:**

- Server listens at `http://127.0.0.1:8000`.
- `GET /api/health` returns HTTP 200 with `status: "healthy"` and database connected.
- PID is recorded at `.agents/skills/verify-diffly/.pids/backend.pid`.

For fullstack verification including Next.js frontend:

```bash
pnpm dev:next
```

(Frontend is accessible at `http://localhost:3000`).

## Doctor

Before driving features or when anything fails, run the doctor check:

```bash
.agents/skills/verify-diffly/scripts/doctor.sh
```

The doctor verifies:

1. Backend process is active and owns port 8000.
2. `/api/health` endpoint responds with `healthy` status.
3. Database connection is active and seeded challenges are queryable.

## Drive

Drive user-facing features using the unified drive script:

```bash
# Drive review submission on an AI agent code vulnerability
.agents/skills/verify-diffly/scripts/drive.sh review

# Drive challenge catalog exploration
.agents/skills/verify-diffly/scripts/drive.sh catalog

# Drive system health check
.agents/skills/verify-diffly/scripts/drive.sh health

# Drive strict code formatting and spacing guardrail
.agents/skills/verify-diffly/scripts/drive.sh formatting
```

See the [Feature Map](features/README.md) for detailed descriptions, user POV journeys, and gotchas for each feature.

## Evidence

Every drive captures concrete proof stored in:
`.agents/skills/verify-diffly/evidence/<TIMESTAMP>_<FEATURE>.[json|txt]`

Proof standards:

- Real HTTP requests and real JSON responses.
- Accurate validation of defect evaluation, scoring (0-100), and feedback.
- Verification artifacts survive instance teardown.

## Cleanup

Tear down any background processes started by the verification run:

```bash
.agents/skills/verify-diffly/scripts/cleanup.sh
```

Cleanup kills only the specific PIDs recorded by `launch.sh` and preserves the `evidence/` directory.

## Helpers

All helper scripts are located in `.agents/skills/verify-diffly/scripts/` and are fully executable:

- `scripts/launch.sh`: Prepares database, seeds challenges, starts server, waits for readiness.
- `scripts/doctor.sh`: Read-only health and database state verification.
- `scripts/drive.sh`: Exercises features (`health`, `catalog`, `review`, `formatting`) and records evidence.
- `scripts/cleanup.sh`: Safely terminates server instances by PID.
