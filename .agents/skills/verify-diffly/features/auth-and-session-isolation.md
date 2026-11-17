# Auth and Session Isolation

Auth and session isolation keeps each guest's review history, progress metrics, and private challenges separated by an HMAC-signed `HttpOnly` `diffly_guest_session` cookie issued by the server, lets a guest claim that data once upon registering or logging in (while clearing `session_id`), enforces `Authorization: Bearer` fallback when cookies are expired/invalid/inactive, and revokes access on logout, invalid cookies, deactivated accounts, or forged `x-user-id` / `X-Diffly-Session-Id` headers in any environment.

## Sub-features

- `guest-session-scoping` isolates review submissions, progress, and custom challenges per verified `diffly_guest_session` `HttpOnly` cookie and rejects forged `X-Diffly-Session-Id` headers or raw `session_id` inputs.
- `register-and-claim` creates a user account via `/api/auth/register`, sets the `diffly_access_token` `HttpOnly` cookie, migrates unclaimed guest rows to `user_id` (clearing `session_id = NULL`), and clears `diffly_guest_session` (or preserves guest state with `X-Diffly-Claim-Status: quota_exceeded` if claiming would exceed the 5-challenge limit).
- `post-claim-revocation` ensures the pre-claim `diffly_guest_session` cookie no longer exposes claimed submissions, progress, or custom challenges to unauthenticated callers or another user.
- `logout-and-relogin` clears the `diffly_access_token` cookie on `/api/auth/logout`, restores access on `/api/auth/login`, and falls back to valid `Authorization: Bearer` tokens when the auth cookie is expired, invalid, or belongs to an inactive user.
- `forged-and-inactive-rejection` rejects garbage/tampered cookies, deactivated accounts, raw `X-Diffly-Session-Id` / `session_id` claim attempts (`403`), and `x-user-id` headers in both development and `ENVIRONMENT=production`.

## How to get to it (user POV)

- Submit a code review or generate a custom challenge in the browser as a guest, which receives an HMAC-signed `HttpOnly` `diffly_guest_session` cookie.
- Click `Sign In` or `Register` in the navbar to open the `Diffly Account` modal and submit `/api/auth/login` or `/api/auth/register`.
- Open the account menu in the navbar and choose `Sign Out` to call `/api/auth/logout`.

## Driving it with scripts/drive.sh

Preconditions:

- Backend is launched against an isolated throwaway SQLite DB via `.agents/skills/verify-diffly/scripts/launch.sh`.
- `.agents/skills/verify-diffly/scripts/doctor.sh` passes and `.pids/backend.port` and `.pids/backend.db_url` exist.

- **Drive full two-user auth isolation suite.** Run `.agents/skills/verify-diffly/scripts/drive.sh auth-isolation`. Exit code is `0` and JSON evidence is written to `evidence/<TIMESTAMP>_auth-isolation.json` with `"verdict": "PASSED"`.
- **Guest isolation before registration.** Guest A submits a review via `POST /api/challenges/{slug}/review` (receiving a signed `diffly_guest_session` cookie); Guest B uses a separate cookie jar and observes empty history, `total_attempted: 0`, and empty custom items. Sending a forged `X-Diffly-Session-Id` header yields zero access.
- **Claim on register and old-session lock.** User A calls `POST /api/auth/register` with Guest A's cookie jar, confirms `GET /api/auth/me` and `GET /api/user/progress` via cookie auth, and confirms replaying the pre-claim `diffly_guest_session` cookie (or sending raw `X-Diffly-Session-Id` / tampered cookies) observes zero leaked items and `403` on explicit `/api/user/claim-session` tampering.
- **Logout, login, Bearer fallback, and forged auth checks.** User A calls `POST /api/auth/logout` (`GET /api/auth/me` returns `401`, progress returns `0`), logs back in via `POST /api/auth/login` (progress restored), confirms expired/invalid `diffly_access_token` falls back to valid `Authorization: Bearer`, sends a garbage `diffly_access_token` cookie (`401` on `/api/auth/me`), deactivates an account (`401` on `/api/auth/me`, `403` on `/api/auth/login`), and sends `x-user-id` against both the development server and an ephemeral `ENVIRONMENT=production` server (`401` on `/api/auth/me`, `0` attempted progress).

## Gotchas

- Never use the `x-user-id` or `X-Diffly-Session-Id` headers as shortcuts; both are rejected/ignored and tested as negative security checks.
- Setting `ENVIRONMENT=production` enables the `Secure` flag on `diffly_access_token` and `diffly_guest_session`, which `httpx` will not send over plain `http://127.0.0.1`. Keep the main launched server in `ENVIRONMENT=development` for HTTP cookie flows and isolate the `ENVIRONMENT=production` check to the temporary sub-process.
- When `GEMINI_API_KEY` is unset, Guest A's private custom challenge is seeded directly into the isolated throwaway SQLite DB and recorded in `metadata.custom_challenge_setup` inside the evidence JSON.
