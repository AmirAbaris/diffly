# Auth and Session Isolation

Auth and session isolation keeps each guest's review history, progress metrics, and private challenges separated by `X-Diffly-Session-Id`, lets a guest claim that data once upon registering or logging in with an `HttpOnly` cookie, and revokes access on logout, invalid cookies, deactivated accounts, or forged `x-user-id` headers in any environment.

## Sub-features

- `guest-session-scoping` isolates review submissions, progress, and custom challenges per `X-Diffly-Session-Id`.
- `register-and-claim` creates a user account via `/api/auth/register`, sets the `diffly_access_token` `HttpOnly` cookie, and migrates unclaimed guest rows to `user_id`.
- `post-claim-revocation` ensures the old `X-Diffly-Session-Id` no longer exposes claimed submissions, progress, or custom challenges to unauthenticated callers or another user.
- `logout-and-relogin` clears the `diffly_access_token` cookie on `/api/auth/logout` and restores cookie access on `/api/auth/login`.
- `forged-and-inactive-rejection` rejects garbage cookies, deactivated accounts, and `x-user-id` headers in both development and `ENVIRONMENT=production`.

## How to get to it (user POV)

- Submit a code review or generate a custom challenge in the browser as a guest, which stores and sends `X-Diffly-Session-Id`.
- Click `Sign In` or `Register` in the navbar to open the `Diffly Account` modal and submit `/api/auth/login` or `/api/auth/register`.
- Open the account menu in the navbar and choose `Sign Out` to call `/api/auth/logout`.

## Driving it with scripts/drive.sh

Preconditions:

- Backend is launched against an isolated throwaway SQLite DB via `.agents/skills/verify-diffly/scripts/launch.sh`.
- `.agents/skills/verify-diffly/scripts/doctor.sh` passes and `.pids/backend.port` and `.pids/backend.db_url` exist.

- **Drive full two-user auth isolation suite.** Run `.agents/skills/verify-diffly/scripts/drive.sh auth-isolation`. Exit code is `0` and JSON evidence is written to `evidence/<TIMESTAMP>_auth-isolation.json` with `"verdict": "PASSED"`.
- **Guest isolation before registration.** Guest A submits a review via `POST /api/challenges/{slug}/review` with `X-Diffly-Session-Id`; Guest B queries `GET /api/challenges/{slug}/submissions`, `GET /api/user/progress`, and `GET /api/challenges/custom` with a different `X-Diffly-Session-Id` and observes empty history, `total_attempted: 0`, and empty custom items.
- **Claim on register and old-session lock.** User A calls `POST /api/auth/register` with Guest A's `session_id`, confirms `GET /api/auth/me` and `GET /api/user/progress` via cookie auth, and confirms unauthenticated or User B requests carrying the old `X-Diffly-Session-Id` (including `POST /api/user/claim-session`) observe zero leaked or reclaimed items.
- **Logout, login, and forged auth checks.** User A calls `POST /api/auth/logout` (`GET /api/auth/me` returns `401`, progress returns `0`), logs back in via `POST /api/auth/login` (progress restored), sends a garbage `diffly_access_token` cookie (`401` on `/api/auth/me`), deactivates an account (`401` on `/api/auth/me`, `403` on `/api/auth/login`), and sends `x-user-id` against both the development server and an ephemeral `ENVIRONMENT=production` server (`401` on `/api/auth/me`, `0` attempted progress).

## Gotchas

- Never use the `x-user-id` header as a shortcut for authenticated requests; `x-user-id` is rejected in all environments and tested as a negative security check.
- Setting `ENVIRONMENT=production` enables the `Secure` flag on `diffly_access_token`, which `httpx` will not send over plain `http://127.0.0.1`. Keep the main launched server in `ENVIRONMENT=development` for HTTP cookie flows and isolate the `ENVIRONMENT=production` header-rejection check to the temporary sub-process.
- When `GEMINI_API_KEY` is unset, Guest A's private custom challenge is seeded directly into the isolated throwaway SQLite DB and recorded in `metadata.custom_challenge_setup` inside the evidence JSON.
