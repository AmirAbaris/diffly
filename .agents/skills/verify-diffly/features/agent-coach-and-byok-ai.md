# Agent Coach and BYOK AI Connection

Agent Coach analyzes a caller's recurring review blind spots, supports streaming debrief and patterns conversations, and generates targeted custom challenges using a user-supplied multi-provider AI key sealed inside a Next.js-only `HttpOnly` cookie (`diffly_byok_ai`).

## Sub-features

- `byok-cookie-connection` manages multi-provider AI credentials (Google Gemini, OpenAI, Anthropic, or OpenAI-compatible) via `GET`, `POST`, and `DELETE /api/ai/connection` (`app/api/ai/connection/route.ts`), encrypting keys with AES-256-GCM (`diffly_byok_ai`, `HttpOnly`, `SameSite=Lax`, `Path=/api`) and rejecting cross-site mutations with `403`.
- `coach-patterns-aggregation` aggregates each actor's missed defects and weakest categories via `GET /api/user/coach-patterns` (`api/routes/user.py`, `backend/services/coach_service.py`), strictly scoped by `ActorDep` so guests and users never see another actor's history.
- `streaming-coach-route` serves `POST /api/coach` (`app/api/coach/route.ts`), requiring a sealed `diffly_byok_ai` cookie (`401` when missing), enforcing cross-site `403` guards, forwarding only allowlisted backend cookies (`diffly_access_token`, `diffly_guest_session`) to FastAPI, and never leaking `diffly_byok_ai` upstream.
- `coach-workspace-and-drawers` renders `/coach` (`CoachWorkspace` with disconnected prompt or zero-state quick prompts, `CoachContextRail`, `CoachInlineGenerator`, `CoachMessageList`, `CoachDrillCard`), `PatternsCoachDrawer` on `/stats`, and `DebriefCoachDrawer` inside `ReviewResultModal`.
- `byok-challenge-generation` serves `POST /api/ai/challenges/generate` (`app/api/ai/challenges/generate/route.ts`), checking quota against FastAPI `GET /api/challenges/custom` and persisting generated drills via `POST /api/challenges/custom`.

## How to get to it (user POV)

- Click `AI Coach & Generate` on `/challenges` or `Agent Coach` in the navbar to open `/coach`.
- When no AI key is configured, `/coach` displays the disconnected card (`[data-testid="coach-disconnected-state"]`) linking to `/settings`.
- Visit `/settings` to add, test, or clear a Gemini, OpenAI, Anthropic, or OpenAI-compatible API key stored in the sealed `diffly_byok_ai` cookie.
- Visit `/stats` to open the `PatternsCoachDrawer`, or complete a review on `/challenges/<slug>` to open `DebriefCoachDrawer` from `ReviewResultModal`.

## Driving it with scripts/drive.sh

Preconditions:

- Backend is launched against an isolated throwaway SQLite DB via `.agents/skills/verify-diffly/scripts/launch.sh` and verified with `scripts/doctor.sh`.
- For live LLM streaming or generation calls, a valid provider API key (`GEMINI_API_KEY` or configured BYOK cookie) is required; without one, live LLM streaming remains `UNTESTED` while UI states, auth/proxy boundaries, and pattern isolation are verified live.

- **Backend actor isolation for coach patterns.** Run `.agents/skills/verify-diffly/scripts/drive.sh auth-isolation` and confirm `user_a_reads_own_coach_patterns` and `user_b_isolated_from_user_a_coach_patterns` pass in `evidence/<TIMESTAMP>_auth-isolation.json`.
- **Visual rendering of `/coach`, `/settings`, and `/stats`.** Run `.agents/skills/verify-diffly/scripts/drive.sh visual` (or `--ephemeral` for telemetry) and confirm `coach`, `settings`, and `stats` capture cleanly on desktop (`1440x900`) and mobile (`390x844`) with zero overflow, overlays, or console errors.
- **Direct Next.js BYOK & Coach boundary probes (against a running Next.js instance `$WEB`).**
  - `GET $WEB/api/ai/connection` returns `200` with `{"connected": false}` and `Cache-Control: no-store`.
  - `POST $WEB/api/ai/connection` or `POST $WEB/api/coach` with `-H "Sec-Fetch-Site: cross-site"` returns `403`.
  - `POST $WEB/api/coach` without a `diffly_byok_ai` cookie returns `401`.
- **Live Gemini generation (when `GEMINI_API_KEY` is configured).** Run `GEMINI_API_KEY='...' .agents/skills/verify-diffly/scripts/drive.sh gemini-live`.

## Gotchas

- In `NODE_ENV=production`, `resolveBYOKSecret` (`lib/ai/cookie.ts`) fails closed unless `BYOK_COOKIE_SECRET` is set to a non-default value of at least 32 characters.
- `diffly_byok_ai` is intentionally scoped to Next.js `/api` routes and excluded from `buildAllowlistedBackendCookieHeader` (`lib/server/backend-client.ts`) so FastAPI never receives raw or sealed provider keys via cookies.
- Without a configured provider API key, report live streaming coach / AI generation as `UNTESTED (provider credentials not configured)`.
