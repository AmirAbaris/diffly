# Custom Challenge Ownership

Custom challenge ownership keeps private generated challenges owned by a single guest session or authenticated user (enforcing a 5-challenge quota), excludes them from public catalog and next-drill endpoints, allows optional owner-controlled unlisted sharing via `share_token`, and prevents cross-guest or cross-user reads, hints/solution leaks, review evaluations, share toggles, and deletions.

## Sub-features

- `private-catalog-and-next-isolation` excludes `is_public=false` custom challenges (whether private or shared) from server-filtered `GET /api/challenges` and `GET /api/challenges/next`, while scoping `GET /api/challenges/custom` strictly to the owner.
- `creation-and-quota` supports private challenge persistence via `POST /api/challenges/custom` (used by the Next.js BYOK route `POST /api/ai/challenges/generate`) and direct `POST /api/challenges/generate-custom` (`X-Gemini-Key`), enforcing the 5-slot `CUSTOM_CHALLENGE_QUOTA`.
- `read-and-solution-gate` returns `404` on `/api/challenges/{slug}`, `/hints`, `/solution`, and `/submissions` for any non-owner without a valid `share_token`.
- `evaluation-gate` returns `404` when a non-owner without a valid `share_token` attempts `POST /api/challenges/{slug}/review`.
- `unlisted-share-tokens` lets only the owner enable, rotate (`regenerate: true`), or revoke `share_token` via `PATCH /api/challenges/custom/{slug}/share` (`403` on public challenges). Valid `?share_token=` grants recipients read, hints, solution, review, and own-submission access (`is_owner: false`, `share_token: null`, `noindex`/`no-referrer` metadata) without granting delete or share-toggle permissions, and immediately returns `404` once rotated or revoked.
- `delete-owner-enforcement` returns `404` when a non-owner (even with a valid `share_token`) attempts `DELETE /api/challenges/custom/{slug}`, `403` when anyone attempts to delete a public catalog challenge, and `200` for the authenticated owner.

## How to get to it (user POV)

- On `/challenges`, click `AI Coach & Generate` (`[data-testid="generate-ai-challenge-btn"]`) to open `/coach` for BYOK challenge generation, or click `Custom: N/5` (`[data-testid="custom-challenges-quota-badge"]`) to open the `Custom Challenge Generator` modal on the `Manage Library` tab.
- Open a custom challenge at `/challenges/<slug>` to read its code snippet, toggle/copy/revoke its unlisted share link (`OwnerShareControls`), request progressive hints, submit a review, or view the solution.
- Recipients visiting `/challenges/<slug>?share_token=<token>` see `SharedChallengeNotice` without owner controls.
- Delete a custom challenge from the `Manage Library` tab in the `Custom Challenge Generator` modal or from `/coach`.

## Driving it with scripts/drive.sh

Preconditions:

- Backend is launched against an isolated throwaway SQLite DB via `.agents/skills/verify-diffly/scripts/launch.sh`.
- `.agents/skills/verify-diffly/scripts/doctor.sh` passes and `.pids/backend.port` and `.pids/backend.db_url` exist.

- **Drive full custom challenge ownership suite.** Run `.agents/skills/verify-diffly/scripts/drive.sh challenge-ownership`. Exit code is `0` and JSON evidence is written to `evidence/<TIMESTAMP>_challenge-ownership.json` with `"verdict": "PASSED"`.
- **Guest ownership and isolation.** Verify `POST /api/challenges/generate-custom` without `X-Gemini-Key` returns `401`. Provision Guest A's private custom challenge, verify Guest A evaluates it (`200`), verify public `/api/challenges` and `/api/challenges/next` exclude it, and verify Guest B gets `404` on detail, review, and delete.
- **Claim and cross-user lock.** Register User A with Guest A's signed `diffly_guest_session` cookie jar, confirm User A reads detail and submission history via cookie auth, confirm replaying the pre-claim cookie returns `404` on read and delete, and confirm User B gets `404` on detail, hints, solution, review evaluation, submissions, share toggle, and delete.
- **Unlisted share token lifecycle.** Confirm User A enables `share_token`, recipient reads detail (`is_owner: false`, `share_token: null`), reads hints and revealed solution, submits a review, and sees only own submissions; non-ASCII tokens return `404`; rotation invalidates the old token; valid `share_token` cannot delete or revoke; revoking immediately returns `404` on detail, hints, solution, and review; toggling share on a public challenge returns `403`.
- **Production header rejection, logout, and owner delete.** Confirm forged `x-user-id` under `ENVIRONMENT=production` gets `404` on read and delete; confirm User A loses access after `/api/auth/logout`, regains access on `/api/auth/login`, deletes the custom challenge (`200`), observes `404` afterward, and gets `403` when deleting a public challenge.

## Gotchas

- `POST /api/challenges/generate-custom` calls Google Gemini externally; when `GEMINI_API_KEY` is unset, the verification script provisions the private challenge row in the isolated throwaway SQLite DB and records that mode in the evidence JSON.
- Non-owners receive `404` (not `403`) on `GET /api/challenges/{slug}`, `/hints`, `/solution`, `/submissions`, `POST /review`, `PATCH /custom/{slug}/share`, and `DELETE /custom/{slug}` to avoid leaking the existence of private custom challenges, whereas deleting or toggling share on a public catalog challenge returns `403`.
