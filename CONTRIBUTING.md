# Contributing to Diffly

Thank you for contributing to Diffly. Every contribution follows our [Code of conduct](CODE_OF_CONDUCT.md). If you discover a security issue, follow [Security policy](SECURITY.md) instead of opening a public issue.

## Ways to contribute

- **Bug reports.** Open an issue with reproduction steps, expected behavior, actual behavior, and your Node.js, pnpm, and Python versions.
- **New challenges.** Author realistic review scenarios under `content/challenges/<slug>/`.
- **Code changes.** Fix bugs, add evaluation improvements, or build frontend and API features.
- **Documentation.** Clarify setup steps, API references, and contributor guides.

## Local development setup

Install the required toolchains before cloning:

- Node.js `>= 22.0.0`
- pnpm `11` (`>= 11.0.0`)
- Python `>= 3.11`

Set up the backend virtual environment, frontend packages, git hooks, and environment file:

```bash
# 1. Create and activate the Python virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# 2. Install Python runtime and dev/test dependencies
pip install -r requirements-dev.txt

# 3. Install Node dependencies and Lefthook git hooks
pnpm install
pnpm prepare

# 4. Create your local environment file
cp .env.example .env

# 5. Start Next.js (port 3000) and FastAPI (port 8000)
pnpm dev
```

Next.js proxies `/api/*` requests on port `3000` to FastAPI on port `8000` through the rewrite rules in `next.config.ts` and `lib/config/api-rewrites.ts`.

## Adding a new challenge

Diffly loads curated challenges from directories under `content/challenges/<slug>/`.

1. Create `content/challenges/<slug>/` using lowercase kebab-case for `<slug>`.
2. Add `snippet.<ext>` (`.py`, `.ts`, `.go`, or `.rs`) containing the defective code without comments that spoil the answer.
3. Add `description.md` with problem context and a `## Threat Model` section.
4. Add `meta.yaml` with challenge metadata, 1-indexed `lines` and `keywords` for each defect in `expected_issues`, three progressive `hints`, `canonical_review`, and `recommended_fix_diff`.
5. Run `pnpm test:py` to confirm `backend/seed/loader.py` and `backend/seed/seed_data.py` validate and load your bundle.

Read [Adding challenges guide](docs/adding-challenges.md) for the complete schema, field constraints, and verification commands.

## Code and architecture rules

CI and Lefthook enforce the rules below across frontend and backend code:

- **React component size limit.** Keep files under 350 non-blank, non-comment lines (`max-lines` in `eslint.config.mjs` and `.oxlintrc.json`). Extract pure parsers into `lib/`, stateful logic into `hooks/`, and sub-views into focused child components.
- **Semantic CSS tokens only.** Never use raw hex, `rgb()`, `hsl()`, `oklch()`, or arbitrary Tailwind color classes in `components/` or `app/`. Use semantic tokens defined in `app/globals.css` (such as `bg-background`, `text-foreground`, and `border-border`).
- **Python formatting and linting.** Format and lint all files in `api/`, `backend/`, `tests/`, and `alembic/` with Ruff (`ruff check` and `ruff format --check`) following PEP 8 and the rules in `pyproject.toml`.
- **Database schema migrations.** Add schema changes via Alembic revisions under `alembic/versions/` (`alembic revision --autogenerate`) and run `alembic upgrade head` against a direct (non-pooler) database URL. Wrap future PostgreSQL `ALTER TYPE ... ADD VALUE` statements in `with op.get_context().autocommit_block():`.
- **Backend test coverage.** Keep Pytest line coverage at or above 85% across `api/` and `backend/`.
- **Authorization matrix registration.** Whenever you add, rename, or remove a FastAPI endpoint, register it in `tests/test_authorization_matrix.py` (`PUBLIC_ROUTES` or `MATRIX`) with expected status codes across anonymous, guest, user, and inactive actors.

## Required checks before opening a PR

Run the full verification suite and TypeScript type checker before pushing:

```bash
pnpm verify
pnpm typecheck
```

`pnpm verify` runs `pnpm lint` (Oxlint, React Doctor, ESLint, and Prettier check), `pnpm test:py` (Pytest with `>= 85%` coverage), `pnpm test` (Vitest), and `pnpm build` (`next build`).

## Commit message convention

Write commit messages in Conventional Commits format:

```text
type(scope): subject
```

Common types include `feat`, `fix`, `docs`, `chore`, `refactor`, and `test` (for example, `feat(challenges): add go goroutine leak bundle` or `fix(api): enforce guest quota check before insert`).

## Pull request checklist

- Branch from an up-to-date `main` with a clear scope.
- Confirm `pnpm verify` and `pnpm typecheck` pass with zero errors.
- Confirm `pnpm lint:py` passes if you modified Python files.
- Register any new or changed FastAPI route in `tests/test_authorization_matrix.py`.
- Describe the motivation, behavioral changes, and verification commands run in the pull request description.
