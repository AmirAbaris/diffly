# Feature: Strict Code Hygiene & Spacing

## Sub-features

- **PEP 8 Spacing & Python Lint:** Ruff (`ruff check` and `ruff format --check` over `api`, `backend`, `tests`, `alembic`) enforces 2 blank lines between top-level functions/classes (`E302`/`E305`), import sorting, and Python lint rules.
- **TypeScript Spacing, Color Tokens & Component Limits:** ESLint enforces `padding-line-between-statements`, `no-multiple-empty-lines`, a 350-line `max-lines` ceiling, and `no-restricted-syntax` banning raw hex/rgb/hsl/oklch color literals in `components/**` and `app/**`.
- **Fast Rust Linting:** Oxlint provides sub-second correctness, React/Next.js/TypeScript rules, and `max-lines` checks.
- **React Best Practices & Diagnostics:** React Doctor (`pnpm lint:doctor` locally; `millionco/react-doctor@v2` with `blocking: error` on PRs/`main`) scans component architecture, hooks, accessibility, and anti-patterns.
- **Formatting, Screenshot Hygiene & Typechecking:** Prettier (`pnpm format:check`), `scripts/check-no-screenshots.sh` (`pnpm lint:screenshots`), and TypeScript (`pnpm typecheck` / `tsc --noEmit`).
- **Pre-commit & CI Guardrails:** Lefthook (`lefthook.yml`) runs these checks locally on pre-commit; GitHub Actions (`.github/workflows/ci.yml` and `.github/workflows/react-doctor.yml`) runs Ruff, `pip-audit`, `pytest` (>= 85% coverage), Prettier, Oxlint, React Doctor, ESLint, screenshot hygiene, Vitest, `next build`, and Playwright E2E.

## How to get to it (user POV)

On local commits, Lefthook runs staged hygiene checks automatically. On pushes and pull requests, GitHub Actions runs the full backend, frontend, build, and E2E verification workflow.

## Driving it with scripts/drive.sh

Run the drive harness (standalone; no running server required):

```bash
.agents/skills/verify-diffly/scripts/drive.sh formatting
```

Confirm exit code `0` and verify `.agents/skills/verify-diffly/evidence/<TIMESTAMP>_formatting.txt` passes all 8 checks (`Ruff Check`, `Ruff Format Check`, `Prettier Check`, `Oxlint Check`, `React Doctor Check`, `ESLint Check`, `Screenshot Hygiene Check`, and `TypeScript Check`).

For local JS/TS checks without Python:

```bash
pnpm lint
pnpm typecheck
```

Note that `pnpm lint` already runs `format:check`, `lint:oxlint`, `lint:doctor`, `lint:js`, and `lint:screenshots`, but does not run Ruff or `typecheck`.

## Gotchas

- `scripts/drive.sh formatting` proves code hygiene only; it never proves runtime auth isolation, challenge ownership, or visual rendering.
- Do not bypass linter errors with `# noqa` or `eslint-disable` unless formally justified.
