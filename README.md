# Diffly

<p align="center">
  <strong>Open-source code review training arena and evaluation platform for AI agent code and pull requests.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License: MIT" /></a>
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16.4-black.svg?style=flat-square&logo=next.js" alt="Next.js" /></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19.3-blue.svg?style=flat-square&logo=react" alt="React 19" /></a>
  <a href="https://fastapi.tiangolo.com"><img src="https://img.shields.io/badge/FastAPI-0.115+-009688.svg?style=flat-square&logo=fastapi" alt="FastAPI" /></a>
  <a href="https://www.python.org"><img src="https://img.shields.io/badge/Python-3.11+-3776AB.svg?style=flat-square&logo=python" alt="Python 3.11+" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg?style=flat-square&logo=typescript" alt="TypeScript" /></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind-v4-38B2AC.svg?style=flat-square&logo=tailwind-css" alt="Tailwind CSS v4" /></a>
  <a href="https://www.docker.com"><img src="https://img.shields.io/badge/Docker-Ready-2496ED.svg?style=flat-square&logo=docker" alt="Docker Ready" /></a>
  <a href="#test-suite-and-code-hygiene"><img src="https://img.shields.io/badge/Coverage-%E2%89%A585%25-brightgreen.svg?style=flat-square" alt="Test Coverage" /></a>
</p>

---

## Why Diffly

AI coding agents write pull requests quickly, so code reviewers spend less time on formatting and more time hunting subtle defects. Reviewers need practice spotting four recurring classes of failure:

- **Unsanitized autonomous tool execution.** Arbitrary code execution (`eval`, shell commands, unsafe deserialization) inside agent tools.
- **Indirect prompt injection.** Untrusted payloads hidden in documents or retrieved context that hijack model instructions.
- **Concurrency and async hazards.** React `useEffect` race conditions, unhandled `asyncio.gather` failures, and Go mutex deadlocks.
- **Security and logic flaws.** Raw SQL interpolation, SSRF, broken replay checks, and integer or floating-point precision bugs.

Diffly puts you in an interactive review arena against realistic code snippets, grades your line flags and written critique against expected defects, and shows you a canonical staff review and fix diff after you submit.

---

## Features

- **Interactive review arena.** Inspect syntax-highlighted code with `prism-react-renderer`, click gutter lines to flag defects, write Markdown review notes with live preview (`Cmd+Enter` or `Ctrl+Enter` to submit), and consult the threat model, defect target, and three-tier progressive hints.
- **Automated evaluation engine.** The scoring service in `backend/services/evaluation_service.py` checks your flagged lines and critique keywords against ground-truth defects, applies a false-positive penalty, and returns line precision, concept coverage, and an overall score from 0 to 100.
- **Side-by-side debrief.** After submission, compare your findings with the canonical staff review and inspect the recommended fix diff.
- **Curated and custom challenges.** Practice on 30+ curated challenges in `content/challenges/` or generate private custom challenges with your own Google Gemini API key via the `X-Gemini-Key` header.
- **Interactive API documentation.** Browse and test every FastAPI endpoint through the Scalar OpenAPI UI at `/scalar`.
- **Containerized and serverless deployment.** Run locally with `docker compose up --build` or deploy Next.js and Python serverless functions using `vercel.json`.

---

## Architecture

```mermaid
graph TD
    User["Developer or Reviewer"]

    subgraph "Frontend: Next.js 16 (Port 3000)"
        AppRouter["App Router (React 19 Server and Client Components)"]
        Catalog["Challenge Catalog and Filter Bar"]
        Arena["Review Arena and Code Viewer"]
        Stores["Zustand Stores (UI, Review Draft, Auth)"]
        SWR["SWR Data Fetching and Cache"]
    end

    subgraph "Backend: FastAPI and Python (Port 8000)"
        APIRoutes["FastAPI REST Routes (/api/*)"]
        AuthModule["JWT Auth and Cookie Sessions"]
        EvalEngine["Automated Defect Evaluation Service"]
        SQLModelORM["SQLModel ORM"]
        ScalarDocs["Scalar OpenAPI Docs (/scalar)"]
    end

    subgraph "Storage and Content"
        DB[(SQLite or PostgreSQL Database)]
        SeedData["Content-as-Code Bundles (content/challenges/)"]
    end

    User -->|Interacts with UI| AppRouter
    AppRouter --> Catalog
    AppRouter --> Arena
    Arena --> Stores
    Stores --> SWR
    SWR -->|"/api/* via Next.js rewrites"| APIRoutes

    APIRoutes --> AuthModule
    APIRoutes --> EvalEngine
    APIRoutes --> SQLModelORM

    SQLModelORM --> DB
    SeedData -->|Seeded on startup| DB
    APIRoutes --> ScalarDocs
```

---

## Challenge taxonomy

Diffly ships 30+ curated challenges across 5 categories (`Agent Antipaths`, `Security`, `Concurrency`, `Performance`, `Logic Flaws`) and 5 languages (`python`, `typescript`, `go`, `rust`, `java`). Each challenge carries an `Easy`, `Medium`, or `Hard` rating.

| Challenge                                             | Category          | Difficulty | Language     | Focus area                                                          |
| :---------------------------------------------------- | :---------------- | :--------- | :----------- | :------------------------------------------------------------------ |
| Unsanitized Autonomous Calculator Tool Execution      | `Agent Antipaths` | `Easy`     | `python`     | Arbitrary code execution through `eval()` in an agent math tool.    |
| FastAPI Raw SQL Query String Interpolation            | `Security`        | `Easy`     | `python`     | SQL injection from f-string query interpolation in a FastAPI route. |
| Next.js React Hook Async State Race Condition         | `Concurrency`     | `Medium`   | `typescript` | Stale async state overwriting newer responses inside `useEffect`.   |
| Unchecked Integer Multiplication Overflow in Billing  | `Logic Flaws`     | `Hard`     | `rust`       | Arithmetic overflow in Rust billing calculation.                    |
| N+1 Query Waterfall in Nested Relationship Serializer | `Performance`     | `Easy`     | `python`     | Repeated per-row database queries inside a serialization loop.      |

---

## Quickstart

Run Diffly with Docker Compose for an isolated container setup, or run Next.js and FastAPI directly on your machine for development.

### Method 1: Docker Compose

Prerequisites: [Docker and Docker Compose](https://docs.docker.com/get-docker/).

```bash
# 1. Clone the repository
git clone https://github.com/AmirAbaris/diffly.git
cd diffly

# 2. Copy the environment template
cp .env.example .env

# 3. Build and launch all services
docker compose up --build
```

Once both containers pass health checks, open these URLs:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- Interactive API docs: `http://localhost:8000/scalar`
- Frontend health check (proxied to FastAPI): `http://localhost:3000/api/health`
- Backend health check: `http://localhost:8000/api/health`

### Method 2: Local development setup

#### Prerequisites

- Node.js `>= 22.0.0`
- pnpm `>= 11.0.0`
- Python `>= 3.11`

#### 1. Backend setup

```bash
# Create and activate a Python virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install Python runtime and test dependencies
pip install -r requirements.txt

# Or install the project in editable mode with dev extras
pip install -e ".[dev]"
```

#### 2. Frontend setup

```bash
# Install Node dependencies
pnpm install

# Install Lefthook pre-commit git hooks
pnpm prepare
```

#### 3. Environment variables

```bash
cp .env.example .env
```

The defaults in `.env.example` run locally against `sqlite:///./diffly.db` without extra configuration.

#### 4. Run both services

Start Next.js on port `3000` and FastAPI on port `8000` in one terminal:

```bash
pnpm dev
```

Or run each server in its own terminal:

```bash
# Terminal 1: Next.js frontend (port 3000)
pnpm dev:next

# Terminal 2: FastAPI backend (port 8000)
pnpm dev:api
```

Requests to `http://localhost:3000/api/health` proxy through the Next.js rewrite rules in `next.config.ts` and `lib/config/api-rewrites.ts` to the FastAPI server on port `8000`.

---

## Environment configuration

`backend/core/config.py` loads settings from `.env` and environment variables.

| Variable                      | Default                                                                                             | Description                                                                                                                                          |
| :---------------------------- | :-------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                | `sqlite:///./diffly.db`                                                                             | SQLModel connection URL for SQLite or PostgreSQL, including Neon pooled endpoints.                                                                   |
| `DB_POOL_SIZE`                | `5`                                                                                                 | SQLAlchemy connection pool size for PostgreSQL.                                                                                                      |
| `DB_MAX_OVERFLOW`             | `10`                                                                                                | Maximum temporary connections allowed above `DB_POOL_SIZE`.                                                                                          |
| `DB_POOL_RECYCLE_SECONDS`     | `300`                                                                                               | Seconds before recycling pooled connections to prevent idle drops on Neon.                                                                           |
| `DB_POOL_PRE_PING`            | `true`                                                                                              | Runs a liveness check before checking out a pooled connection.                                                                                       |
| `JWT_SECRET_KEY`              | `diffly-dev-secret-key-change-in-production-only`                                                   | Secret key for signing JWTs (generate with `openssl rand -hex 32`). Production mode fails fast if left at the default or shorter than 32 characters. |
| `JWT_ALGORITHM`               | `HS256`                                                                                             | Signing algorithm for JWT access tokens.                                                                                                             |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080`                                                                                             | JWT expiration window in minutes (7 days).                                                                                                           |
| `AUTH_COOKIE_NAME`            | `diffly_access_token`                                                                               | Name of the `HttpOnly` cookie that stores the JWT session token.                                                                                     |
| `COOKIE_SECURE`               | `false`                                                                                             | Sets the `Secure` attribute on auth cookies. Set to `true` for HTTPS deployments.                                                                    |
| `CORS_ORIGINS`                | `http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000`           | Allowed cross-origin origins as a comma-separated list or JSON array.                                                                                |
| `CORS_ORIGIN_REGEX`           | `^https://diffly(?:-[a-z0-9]+)*-amirabaris\.vercel\.app$\|^https://diffly(?:-sigma)?\.vercel\.app$` | Regex pattern for dynamic Vercel preview deployment origins.                                                                                         |
| `ENVIRONMENT`                 | `development`                                                                                       | Backend environment mode (`development`, `production`, or `test`). Enables strict JWT validation when set to `production`.                           |
| `NODE_ENV`                    | `development`                                                                                       | Node.js and Next.js environment mode (`development`, `production`, or `test`).                                                                       |
| `PORT`                        | `8000`                                                                                              | Backend port (`next dev` listens on `3000`).                                                                                                         |
| `BACKEND_URL`                 | `http://localhost:8000`                                                                             | Upstream FastAPI URL for Next.js API rewrites. Leave unset on Vercel serverless deployments.                                                         |

---

## Deployment and production hosting

### 1. Neon PostgreSQL integration

Diffly supports Neon serverless PostgreSQL, including PgBouncer `-pooler` endpoints. `backend/core/config.py` automatically appends `sslmode=require` to `*.neon.tech` URLs when omitted.

```env
DATABASE_URL=postgresql://neondb_owner:npg_password@ep-bold-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
JWT_SECRET_KEY=replace-with-output-of-openssl-rand-hex-32
COOKIE_SECURE=true
ENVIRONMENT=production
NODE_ENV=production
```

Apply Alembic schema migrations and seed curated challenges against your Neon database (use the direct, non-`-pooler` Neon connection URL for DDL migrations):

```bash
DATABASE_URL="postgresql://neondb_owner:npg_password@ep-bold.us-east-2.aws.neon.tech/neondb?sslmode=require" alembic upgrade head
python -m backend.seed.seed_data
```

If an existing pre-Alembic database (local `diffly.db`, Docker `diffly-data` volume, or Neon PostgreSQL) already has the schema installed without `alembic_version`, verify its constraints/enums match the baseline and stamp it once before applying future migrations (or delete a disposable local `diffly.db` to recreate cleanly):

```bash
alembic stamp head
```

For future PostgreSQL enum value additions (such as `ALTER TYPE ... ADD VALUE`), execute the statement inside `with op.get_context().autocommit_block():` in the Alembic migration.

### 2. Vercel deployment

`vercel.json` routes `/api/(.*)` to the FastAPI serverless entrypoint `api/index.py` and attaches `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy` headers.

1. Import the GitHub repository in the Vercel dashboard.
2. Configure these environment variables:
   - `DATABASE_URL`: Your pooled Neon PostgreSQL connection string.
   - `JWT_SECRET_KEY`: Random 256-bit hex secret from `openssl rand -hex 32`.
   - `COOKIE_SECURE`: `true`.
   - `ENVIRONMENT`: `production`.
   - `CORS_ORIGIN_REGEX`: `^https://diffly(?:-[a-z0-9]+)*-amirabaris\.vercel\.app$|^https://diffly(?:-sigma)?\.vercel\.app$`.
   - `BACKEND_URL` (optional): Leave unset when using Vercel Python serverless functions, or set to an external API origin if you host FastAPI separately.
3. Deploy with `vercel --prod` or push to your production branch, then verify that `/api/health` returns `"status": "healthy"` and `"database": "connected"`.

---

## API overview

FastAPI exposes the REST endpoints below and serves interactive Scalar documentation at `/scalar`.

| Method   | Endpoint                                   | Description                                                                                       |
| :------- | :----------------------------------------- | :------------------------------------------------------------------------------------------------ |
| `GET`    | `/api/health`                              | Return service status, database connectivity, public challenge count, and uptime.                 |
| `GET`    | `/api/challenges`                          | List public challenges with optional `difficulty`, `category`, `language`, and `search` filters.  |
| `GET`    | `/api/challenges/{identifier}`             | Fetch challenge details by numeric ID or slug.                                                    |
| `GET`    | `/api/challenges/{identifier}/hints`       | Fetch progressive hints (tiers 1 to 3) for a challenge.                                           |
| `GET`    | `/api/challenges/{identifier}/solution`    | Fetch canonical staff review and fix diff (requires a prior submission or `?reveal=true`).        |
| `POST`   | `/api/challenges/{identifier}/review`      | Submit flagged lines and critique comments for automated evaluation.                              |
| `GET`    | `/api/challenges/{identifier}/submissions` | List past review submissions for a challenge scoped to the current user or guest session.         |
| `POST`   | `/api/challenges/generate-custom`          | Generate and save a private custom challenge using the `X-Gemini-Key` header (5-challenge quota). |
| `GET`    | `/api/challenges/custom`                   | List private custom challenges and remaining quota for the current user or guest session.         |
| `DELETE` | `/api/challenges/custom/{identifier}`      | Delete a private custom challenge by ID or slug.                                                  |
| `POST`   | `/api/challenges/evaluate-custom`          | Statelessly evaluate a review against custom challenge defect criteria.                           |
| `POST`   | `/api/auth/register`                       | Register a new account, claim guest records, and set the auth cookie.                             |
| `POST`   | `/api/auth/login`                          | Authenticate with username or email and password, claim guest records, and set the auth cookie.   |
| `GET`    | `/api/auth/me`                             | Return the signed-in user's profile.                                                              |
| `POST`   | `/api/auth/logout`                         | Clear the authentication cookie.                                                                  |
| `GET`    | `/api/user/progress`                       | Return overall accuracy, solved count, UTC streak days, and category breakdown.                   |
| `POST`   | `/api/user/claim-session`                  | Migrate anonymous guest submissions and custom challenges to the signed-in account.               |
| `GET`    | `/scalar`                                  | Interactive OpenAPI documentation powered by Scalar.                                              |

---

## Test suite and code hygiene

Diffly runs static checks, unit tests, coverage thresholds, and a production Next.js build:

```bash
# Run all linters, Pytest, Vitest, and Next.js production build
pnpm verify

# Check TypeScript types without emitting build artifacts
pnpm typecheck

# Run frontend unit and component tests (Vitest)
pnpm test

# Run backend tests with strict >=85% coverage enforcement (Pytest)
pnpm test:py

# Run Python lint and formatting checks (Ruff)
pnpm lint:py

# Run JavaScript and TypeScript checks (Oxlint, React Doctor, ESLint, Prettier check)
pnpm lint

# Format frontend and Markdown files with Prettier
pnpm format
```

---

## Repository structure

```text
diffly/
├── api/                          # FastAPI route handlers and dependencies
│   ├── routes/                   # Auth, challenge, submission, and user endpoints
│   ├── deps.py                   # Cookie/Bearer auth and DB session dependencies
│   └── index.py                  # FastAPI app, CORS middleware, /api/health, /scalar
├── backend/                      # Backend core, models, seeding, and services
│   ├── core/                     # Config settings, DB engine, password/JWT utilities
│   ├── models/                   # SQLModel tables and Pydantic request/response schemas
│   ├── seed/                     # Content-as-Code bundle loader and database seeder
│   └── services/                 # Evaluation engine, ownership guards, Gemini BYOK generator
├── content/
│   └── challenges/               # Curated Content-as-Code challenge bundles (<slug>/)
├── docs/                         # Contributor and challenge-authoring guides
├── app/                          # Next.js 16 App Router pages and global styles
│   ├── (catalog)/
│   │   └── challenges/           # Challenge catalog route group
│   └── challenges/[slug]/        # Interactive Review Arena page
├── components/                   # Modular UI components (350-line ESLint limit)
│   ├── auth/                     # Sign-in and registration dialogs
│   ├── challenges/               # Catalog cards, grids, and custom generator UI
│   ├── landing/                  # Landing page, interactive diff sandbox, shader stage
│   ├── layout/                   # Header, footer, and navigation chrome
│   ├── review/                   # Code viewer, comment drawer, score meter, debrief diff
│   └── ui/                       # Radix UI and shadcn primitives
├── hooks/                        # Custom React hooks for auth, drafts, hints, and stats
├── stores/                       # Zustand stores for arena UI, drafts, and modals
├── tests/                        # Pytest backend tests and Vitest frontend tests
├── CODE_OF_CONDUCT.md            # Contributor Covenant v2.1
├── CONTRIBUTING.md               # Local setup, coding rules, and PR workflow
├── Dockerfile                    # Multi-stage backend and frontend container build
├── SECURITY.md                   # Vulnerability reporting policy and security scope
├── docker-compose.yml            # Local multi-container orchestration with health checks
├── lefthook.yml                  # Pre-commit checks for JS, TS, CSS, Markdown, and Python
└── package.json                  # Workspace scripts and frontend dependencies
```

---

## Contributing

Diffly stores every curated challenge as a standalone directory under `content/challenges/<slug>/` containing three files:

- `meta.yaml`: Slug, title, difficulty, category, language, expected defect criteria, three-tier hints, canonical review, and recommended fix diff.
- `description.md`: Problem context and `## Threat Model` section.
- `snippet.<ext>`: Unsanitized code snippet in `.py`, `.ts`, `.go`, `.rs`, or `.java`.

`backend/seed/loader.py` discovers those directories automatically and `backend/seed/seed_data.py` seeds them into the database on startup.

Before opening a pull request, read these project guides:

- [Contributing guide](CONTRIBUTING.md) for local setup, architecture limits, `pnpm verify`, and PR requirements.
- [Adding challenges guide](docs/adding-challenges.md) for the exact `meta.yaml` schema and line-numbering rules.
- [Code of conduct](CODE_OF_CONDUCT.md) for community expectations.
- [Security policy](SECURITY.md) for reporting vulnerabilities privately.

---

## License

Diffly is released under the [MIT License](LICENSE).

The bundled `geist` font package (`geist` in `package.json`, loaded in `app/layout.tsx`) is licensed under the SIL Open Font License 1.1.
