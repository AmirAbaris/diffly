---
name: verify-diffly
description: "Verify the Diffly platform baseline (FastAPI backend + Next.js frontend). Launch, doctor, drive features, and capture proof."
disable-model-invocation: true
---

# Verify Diffly

This skill verifies the **Diffly** codebase.

The stack comprises:

- **Backend:** FastAPI with modular architecture scaffold.
- **Frontend:** Next.js (App Router), shadcn/ui components, SWR, Axios, Tailwind CSS.
- **Code Quality:** Strict PEP 8 function spacing (Ruff E302/E305), Prettier, Oxlint fast checks, React Doctor best practices, ESLint `padding-line-between-statements`, and GitHub Actions CI.

## Launch

Start the FastAPI backend server for verification using the launch helper:

```bash
.agents/skills/verify-diffly/scripts/launch.sh
```

**Ready criteria:**

- Server listens at `http://127.0.0.1:8000`.
- `GET /api/health` returns HTTP 200 with `status: "healthy"`.
- PID is recorded at `.agents/skills/verify-diffly/.pids/backend.pid`.

For fullstack verification including Next.js frontend:

```bash
pnpm dev:next
```

## Doctor

Before driving features or when anything fails, run the doctor check:

```bash
.agents/skills/verify-diffly/scripts/doctor.sh
```

The doctor verifies:

1. Backend process is active and owns port 8000.
2. `/api/health` endpoint responds with `healthy` status.

## Drive

Drive active features using the drive script:

```bash
# Drive system health check
.agents/skills/verify-diffly/scripts/drive.sh health

# Drive strict code formatting and spacing guardrail
.agents/skills/verify-diffly/scripts/drive.sh formatting

# Drive live Google Gemini BYOK generation (requires GEMINI_API_KEY)
GEMINI_API_KEY='...' .agents/skills/verify-diffly/scripts/drive.sh gemini-live
```

See the [Feature Map](features/README.md) for detailed descriptions.

## External Integration Verification Protocol

When working on third-party integrations (e.g. Google Gemini, external LLMs, webhooks):

1. **Never rely solely on mocks**: Unit tests with mocks verify parser logic, but they DO NOT verify endpoint validity, active model availability, or provider deprecation.
2. **Drive Live Evidence**: When live credentials are provided or requested via `request_secret`, run `.agents/skills/verify-diffly/scripts/drive.sh gemini-live` and confirm evidence is captured in `.agents/skills/verify-diffly/evidence/`.
3. **Transparent Reporting**: If live credentials are not available, agents MUST explicitly state:
   - "Mock/Unit tests: PASSED"
   - "Live Provider Verification: UNTESTED (credentials not configured)"
     Never declare a third-party API integration "fully tested and verified" based solely on unit test mocks.

## Evidence

Every drive captures concrete proof stored in:
`.agents/skills/verify-diffly/evidence/<TIMESTAMP>_<FEATURE>.[json|txt]`

## Cleanup

Tear down background processes started by the verification run:

```bash
.agents/skills/verify-diffly/scripts/cleanup.sh
```

## Helpers

All helper scripts are located in `.agents/skills/verify-diffly/scripts/` and are fully executable:

- `scripts/launch.sh`: Starts server and awaits readiness.
- `scripts/doctor.sh`: Read-only health check.
- `scripts/drive.sh`: Exercises features (`health`, `formatting`) and records evidence.
- `scripts/cleanup.sh`: Safely terminates server instances by PID.
