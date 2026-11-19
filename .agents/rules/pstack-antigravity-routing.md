---
description: Antigravity-specific pstack routing (invoke_subagent vs swarm) and quota fallback rules
trigger: always_on
---

# pstack Antigravity Routing & Quota Fallback

Apply these rules whenever running `pstack` skills in Antigravity alongside `.agents/rules/pstack-models.md`. They supersede Cursor-era fallback tables in bundled `pstack` skills.

## 1. Tool Split (`invoke_subagent` vs `swarm`)

- **`invoke_subagent`** only accepts abstract tiers (`inherit`, `flash_lite`, `flash`, `pro`). Use `inherit` for standard code-writing roles so they run on your active Gemini 4 / Claude 5.5 parent model instead of an opaque `flash` tier; keep `flash` for fast read-only exploration/tooling.
- **`swarm`** accepts explicit model slugs. Prefer `swarm` (`action: "add"`) for `swarm workers`, `arena runners`, `arena cross-judge pool`, `architect runners`, and `interrogate reviewers` so panels get real cross-family diversity.
  - Preserve isolation (`workspace: "share"` or `"branch"`) for parallel writers (`arena`, `architect`).
  - Explicitly instruct `readonly: true` in the brief for read-only reviewers (`interrogate`, `arena cross-judge pool`).
- **If a workflow must use `invoke_subagent` instead of `swarm`**, map explicit slugs in this precedence order:
  1. Any `claude-opus-*`, `-max`, or `-xhigh` slug -> `pro`
  2. `claude-sonnet-5-5-high` -> `pro`
  3. All other `-high`, `-medium`, or `-low` slugs (including `claude-sonnet-5-5-medium`) -> `inherit` (or `pro` if security-sensitive)

## 2. Security Floor

- Honor `.agents/rules/security-sensitive-code.md`: security-sensitive implementers and reviewers must stay on `pro` (or an equivalent top-tier `swarm` slug such as `claude-opus-5-5-high` / `gemini-4-hydrogen-xhigh`). Never downgrade them to `flash` or a lower-tier `inherit`.

## 3. Quota / Capacity Fallback Chain (Default to Gemini 4 Hydrogen)

When a model hits quota or capacity limits, apply this chain (and warn if a multi-model panel collapses two seats to the same family):

1. **`claude-opus-5-5-*` exhausted:**
   - For cross-family panels (`arena`, `architect`, `interrogate`, `arena cross-judge pool`): try `claude-sonnet-5-5-high` first to preserve cross-vendor diversity; if that is also exhausted, fall back to `gemini-4-hydrogen-xhigh` (for `-xhigh`/`-max`) or `gemini-4-hydrogen-high`.
   - For single-model roles: fall back directly to `gemini-4-hydrogen-high` (or `-xhigh`).
2. **`claude-sonnet-5-5-*` exhausted:**
   - Fall back to `gemini-4-hydrogen-*` at the matching effort level (`high` -> `high`, `medium` -> `medium`, `low` -> `low`).
3. **`gemini-4-neon-*` or `gemini-4-argon-*` exhausted:**
   - Fall back to `gemini-4-hydrogen-*` at the matching effort level (`xhigh` -> `xhigh`, `high` -> `high`, `medium` -> `medium`, `low` -> `low`).
4. **`gemini-4-hydrogen-*` exhausted:**
   - Step down one effort level within Hydrogen (`xhigh` -> `high` -> `medium` -> `low`).
   - If all Hydrogen tiers are exhausted, fall back to `gemini-4-neon-medium` or `claude-sonnet-5-5-medium` (only use `inherit` if the parent session is not also on Hydrogen).
5. **Active `waiting` swarm workers:**
   - Switch the worker in-place with `swarm(action="model", name=..., model="<next-fallback-in-chain>")` using steps 1–4 above, rather than killing and re-adding it or hardcoding a model that already hit quota.
