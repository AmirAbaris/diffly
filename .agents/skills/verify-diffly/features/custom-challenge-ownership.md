# Custom Challenge Ownership

Custom challenge ownership keeps private generated challenges visible, reviewable, and deletable only by the guest session that created them or the authenticated user who claimed them, preventing cross-guest or cross-user reads, hints/solution leaks, review evaluations, and deletions.

## Sub-features

- `private-catalog-isolation` excludes `is_public=false` custom challenges from `GET /api/challenges` and scopes `GET /api/challenges/custom` to the owner.
- `read-and-solution-gate` returns `404` on `/api/challenges/{slug}`, `/hints`, `/solution`, and `/submissions` for any non-owner.
- `evaluation-gate` returns `404` when a non-owner attempts `POST /api/challenges/{slug}/review` on someone else's custom challenge.
- `delete-owner-enforcement` returns `403` when a non-owner attempts `DELETE /api/challenges/custom/{slug}` or anyone attempts to delete a public catalog challenge, and `200` for the authenticated owner.

## How to get to it (user POV)

- On `/challenges`, choose `Generate with AI` or `Custom: N/5` to open the `Custom Challenge Generator` modal, create a challenge, or manage your private library.
- Open a custom challenge at `/challenges/<slug>` to read its code snippet, request progressive hints, submit a review, or view the solution.
- Delete a custom challenge from the `Manage Library` tab in the `Custom Challenge Generator` modal.

## Driving it with scripts/drive.sh

Preconditions:

- Backend is launched against an isolated throwaway SQLite DB via `.agents/skills/verify-diffly/scripts/launch.sh`.
- `.agents/skills/verify-diffly/scripts/doctor.sh` passes and `.pids/backend.port` and `.pids/backend.db_url` exist.

- **Drive full custom challenge ownership suite.** Run `.agents/skills/verify-diffly/scripts/drive.sh challenge-ownership`. Exit code is `0` and JSON evidence is written to `evidence/<TIMESTAMP>_challenge-ownership.json` with `"verdict": "PASSED"`.
- **Guest ownership and isolation.** Verify `POST /api/challenges/generate-custom` without `X-Gemini-Key` returns `401`. Provision Guest A's private custom challenge, verify Guest A evaluates it (`200`), verify public `/api/challenges` excludes it, and verify Guest B gets `404` on detail/review and `403` on delete.
- **Claim and cross-user lock.** Register User A with Guest A's `X-Diffly-Session-Id`, confirm User A reads detail and submission history via cookie auth, confirm the old session ID returns `404` on read and `403` on delete, and confirm User B gets `404` on detail, hints, solution, review evaluation, and submissions, plus `403` on delete.
- **Production header rejection, logout, and owner delete.** Confirm forged `x-user-id` under `ENVIRONMENT=production` gets `404` on read and `403` on delete; confirm User A loses access after `/api/auth/logout`, regains access on `/api/auth/login`, deletes the custom challenge (`200`), observes `404` afterward, and gets `403` when deleting a public challenge.

## Gotchas

- `POST /api/challenges/generate-custom` calls Google Gemini externally; when `GEMINI_API_KEY` is unset, the verification script provisions the private challenge row in the isolated throwaway SQLite DB and records that mode in the evidence JSON.
- Non-owners receive `404` (not `403`) on `GET /api/challenges/{slug}`, `/hints`, `/solution`, `/submissions`, and `POST /review` to avoid leaking the existence of private custom challenges, whereas `DELETE /api/challenges/custom/{slug}` returns `403`.
