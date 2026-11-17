<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Frontend Component Architecture & Cleanliness

- **Maximum Component Length:** 350 lines hard ceiling (enforced by ESLint and Oxlint `max-lines`). Target 100–250 lines per file.
- **Single Responsibility:** A component file must not contain multiple independent subcomponents, modals, and pure data parsers.
- **Decomposition Mandate:**
  - Extract pure parsers, tokenizers, and math into dedicated `.ts` files.
  - Extract distinct sub-views (dialogs, columns, drawer contents, hero cards) into dedicated subcomponents under a subfolder.
  - Extract state, timers, and storage into custom hooks under `hooks/`.
- **Pre-commit Gate:** Lefthook runs ESLint, Oxlint, Prettier, and React Doctor. Any monolithic component over 350 lines is blocked at commit time.

## Rules and what enforces them

Levels follow pstack `/correct` in descending strength: `architecture`, `types/lint/CI`, `test`, `doc-only`. When corrected twice for the same mistake, fix it at the highest level that works and add or update a row here.

| Rule | Enforced by | Level |
| --- | --- | --- |
| Component max length (350 lines) | `eslint.config.mjs` (`max-lines`), `.oxlintrc.json` (`max-lines`), `lefthook.yml`, `.github/workflows/ci.yml` | `types/lint/CI` |
| Component decomposition & single responsibility | None | `doc-only` (`unenforced`) |
| No raw hex/rgb/hsl or arbitrary Tailwind colors in `components/**` and `app/**` | `eslint.config.mjs` (`no-restricted-syntax`), `lefthook.yml`, `.github/workflows/ci.yml` | `types/lint/CI` |
| Frontend formatting & blank-line discipline | `prettier --check`, `eslint.config.mjs` (`padding-line-between-statements`, `no-multiple-empty-lines`), `lefthook.yml`, `.github/workflows/ci.yml` | `types/lint/CI` |
| TypeScript type safety | `tsc --noEmit` (`lefthook.yml`), `next build` (`.github/workflows/ci.yml`) | `types/lint/CI` |
| React best practices & anti-patterns | `react-doctor` (`lefthook.yml`, `.github/workflows/ci.yml`, `.github/workflows/react-doctor.yml` with `blocking: error`) | `types/lint/CI` |
| Python PEP 8 spacing & lint | `ruff check`, `ruff format --check` (`lefthook.yml`, `.github/workflows/ci.yml`) | `types/lint/CI` |
| Frontend unit & component tests | `vitest run` (`.github/workflows/ci.yml`) | `test` |
| Backend unit & API tests (>= 85% coverage) | `pytest --cov=api --cov=backend --cov-fail-under=85` (`.github/workflows/ci.yml`) | `test` |
| Read design skills before UI work & name them in subagent briefs (`.agents/rules/design-work.md`) | None | `doc-only` (`unenforced`) |
| Visual verification via `verify-diffly` `visual` drive & fresh-agent judge (`.agents/rules/design-work.md`) | `.agents/skills/verify-diffly/` `visual` drive; fresh-agent judge has no automated enforcer | `doc-only` (`semi-enforced`) |
| No committed verification screenshots (`.agents/skills/verify-diffly/.screenshots/` gitignored, cleaned via `cleanup.sh`) | `scripts/check-no-screenshots.sh` (`pnpm lint:screenshots`), `lefthook.yml` (`no-screenshots`), `.github/workflows/ci.yml`, `.gitignore` | `types/lint/CI` |
| Security-sensitive code abuse-case list, data owner, `/interrogate`, `pro` models, fresh verifier, `ask` triage (`.agents/rules/security-sensitive-code.md`) | None | `doc-only` (`unenforced`) |
| Authorization matrix for auth and ownership endpoints (`.agents/rules/security-sensitive-code.md`) | `tests/test_authorization_matrix.py`, `pytest` (`.github/workflows/ci.yml`) | `test` |
| Live `auth-isolation` and `challenge-ownership` verification (`.agents/rules/security-sensitive-code.md`) | `.agents/skills/verify-diffly/` `auth-isolation` and `challenge-ownership` drives | `doc-only` (`manual drive`) |
| pstack per-role model routing (`.agents/rules/pstack-models.md`) | None | `doc-only` (`unenforced`) |

