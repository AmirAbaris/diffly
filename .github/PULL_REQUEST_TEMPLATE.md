## Summary

State what changed and why. Link any related issues.

## Type of change

- [ ] Bug fix
- [ ] Feature
- [ ] Challenge content
- [ ] Documentation
- [ ] Refactor or tooling

## Verification

List the commands you ran and their results.

- `pnpm verify`:
- `pnpm typecheck`:

## Checklist

- [ ] `pnpm verify` passes locally (Prettier, Oxlint, React Doctor, ESLint, Ruff, Pytest with >= 85% coverage, Vitest, and Next.js build).
- [ ] `pnpm typecheck` passes with no TypeScript errors.
- [ ] Every modified or added frontend component stays at or below the 350-line limit enforced by `eslint.config.mjs` and `.oxlintrc.json`.
- [ ] New or modified API endpoints update `tests/test_authorization_matrix.py` and verify ownership checks.
- [ ] New challenge bundles under `content/challenges/` pass `tests/test_seed.py` and `tests/test_challenges.py` (see `docs/adding-challenges.md`).
