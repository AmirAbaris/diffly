---
name: verify-ownership-claim
description: "Formally verify Diffly's Guest-to-User Session Claim and Private Custom Challenge Quota/Ownership protocol with TLA+ and TLC. Use when modifying actor resolution, actor locking, custom challenge quota checks, guest session claiming, or challenge deletion in backend/services/ownership.py, api/routes/challenges.py, api/routes/auth.py, or api/routes/user.py."
disable-model-invocation: true
---

# Verify Ownership Claim

Run this check whenever a change touches private custom challenge creation, deletion, quota enforcement, actor scope locking, or guest-to-user session claiming. Read every TLA+ result with the pstack `/statechart` skill so counterexamples and passing state transitions are translated into plain words and a diagram.

## Coverage record

- `sync_commit`: `75be1fb`
- Covered files and functions:
  - `backend/services/ownership.py`: `CUSTOM_CHALLENGE_QUOTA`, `Actor.resolve`, `challenge_owner_filter`, `_lock_actor_scope`, `ensure_custom_quota`, `claim_guest_session`
  - `api/routes/challenges.py`: `_persist_custom_challenge`, `generate_custom_challenge_endpoint`, `create_custom_challenge_endpoint`, `delete_custom_challenge`
  - `api/routes/auth.py`: `adopt_guest_on_sign_in`, `register`, `login`, `github_oauth_callback`
  - `api/routes/user.py`: `claim_guest_session_endpoint`
- Check for drift since `sync_commit`:

```bash
git diff 75be1fb..HEAD -- backend/services/ownership.py api/routes/challenges.py api/routes/auth.py api/routes/user.py
```

Move `sync_commit` forward only after confirming that `specs/OwnershipClaim.tla` and `specs/OwnershipClaim.cfg` still match the implementation at the new commit.

## Invariants and user harm

- `TypeOK`. Every challenge row, actor lock flag, and in-flight claim snapshot stays within its valid domain. If broken, malformed ownership tuples corrupt downstream authorization filters.
- `NoSplitOwnership`. No private custom challenge ever holds both `user_id` and `session_id` at the same time. If broken, a claimed private challenge stays readable through the old guest cookie and leaks the signed-in user's private challenge.
- `UserQuotaNeverExceeded`. No authenticated user ever owns more than `Quota` private custom challenges. If broken, concurrent custom generation and guest-claim requests let a user exceed `CUSTOM_CHALLENGE_QUOTA`.
- `GuestQuotaNeverExceeded`. No guest session ever holds more than `Quota` unclaimed private custom challenges. If broken, concurrent guest generation requests bypass the per-session limit.

## One-command check

```bash
bash .agents/skills/verify-ownership-claim/scripts/verify.sh
```

The script requires `java` (11+) on `PATH`. It looks for `tla2tools.jar` at `$TLC_JAR` or `$HOME/.cache/diffly-tlc/tla2tools.jar`, downloads `v1.8.0` if missing, runs TLC in `-deadlock` mode using a temporary `-metadir`, and removes any `states/` artifacts on exit.

## Scope and bounds

- Bounded constants in `specs/OwnershipClaim.cfg`: `Users = {u1, u2}`, `Guests = {g1}`, `Quota = 2`, `MaxChallenges = 4`. Production sets `CUSTOM_CHALLENGE_QUOTA = 5`.
- Assumes PostgreSQL lock semantics (`SELECT ... FOR UPDATE` on `User.id` and `pg_advisory_xact_lock` on `guest_id`). SQLite development runs skip the guest advisory lock.
- Does not model `Submission` row transfers, public catalog challenges (`is_public = True`), unlisted `share_token` read-only access or revocation (`has_valid_share_token` / `toggle_custom_challenge_share`), slug collision retries, or external LLM HTTP calls (Gemini or Next.js AI SDK).
- Does not enforce liveness or absence of silent cross-user overwrite if two distinct authenticated users concurrently claim the same guest cookie.

## Interpreting results with `/statechart`

Read every TLC output with `/statechart`.

- **When TLC reports an invariant violation.** Trace the shortest counterexample path in `/statechart` back to the action's cited `file:line` in `specs/OwnershipClaim.tla`.
  - **Real bug.** The Python or SQL code omits a lock, omits `session_id = None` scrubbing, or checks `owned + adding <= Quota` without holding the right lock. Fix the code, then rerun `verify.sh`.
  - **Model drift.** The code intentionally changed locking, transaction boundaries, or quota rules after `sync_commit`, and the model still reflects the old behavior. Update `specs/OwnershipClaim.tla` so every action's step boundary and `file:line` comment matches the new code, rerun `verify.sh`, and then update `sync_commit`.
- **When TLC passes.** Inspect the state graph from `/statechart` to confirm new transitions behave as intended before updating `sync_commit`.
