# Diffly ⚡

<p align="center">
  <strong>The open-source code review training arena & evaluation platform for AI agent code and pull requests.</strong>
</p>

<p align="center">
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License: MIT" /></a>
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16.4-black.svg?style=flat-square&logo=next.js" alt="Next.js" /></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19.3-blue.svg?style=flat-square&logo=react" alt="React 19" /></a>
  <a href="https://fastapi.tiangolo.com"><img src="https://img.shields.io/badge/FastAPI-0.115+-009688.svg?style=flat-square&logo=fastapi" alt="FastAPI" /></a>
  <a href="https://www.python.org"><img src="https://img.shields.io/badge/Python-3.11+-3776AB.svg?style=flat-square&logo=python" alt="Python 3.11+" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg?style=flat-square&logo=typescript" alt="TypeScript" /></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind-v4-38B2AC.svg?style=flat-square&logo=tailwind-css" alt="Tailwind CSS v4" /></a>
  <a href="https://www.docker.com"><img src="https://img.shields.io/badge/Docker-Ready-2496ED.svg?style=flat-square&logo=docker" alt="Docker Ready" /></a>
  <a href="#test-suite--code-hygiene"><img src="https://img.shields.io/badge/Coverage-≥85%25-brightgreen.svg?style=flat-square" alt="Test Coverage" /></a>
</p>

---

## 🎯 Why Diffly?

As AI coding agents (Claude, Codex, Devin, Cursor, GitHub Copilot) accelerate code output, the nature of code review has fundamentally changed. Reviewers no longer just look for style issues or simple syntax errors—they must spot:

- **Unsanitized Autonomous Tool Execution:** Arbitrary code execution (`eval`, unvetted subprocesses) in agent workflows.
- **Indirect Prompt Injection:** Hidden payloads in document processing or context retrieval pipelines.
- **Subtle Concurrency & Async Hazards:** React hook race conditions, unhandled `asyncio.gather` pipeline failures.
- **Stealthy Security Vulnerabilities:** Raw SQL interpolations, unauthenticated bypasses, and privilege leaks.

**Diffly** is an open-source, interactive developer arena designed to train, benchmark, and sharpen engineering intuition for reviewing modern agent-generated code and complex pull requests.

---

## ✨ Features

- **🎮 Interactive Review Arena:**
  - Full-featured code viewer powered by `prism-react-renderer` with line-by-line gutter interactions.
  - In-line comment editor supporting Markdown formatting, real-time preview, and shortcut keys (`Cmd/Ctrl + Enter`).
  - Context panel with Threat Model analysis, Defect Target descriptions, and progressive tiered hints.

- **🤖 Automated Evaluation Engine:**
  - Evaluates review findings against ground-truth defect targets.
  - Calculates line-accuracy, precision, recall, and comprehensive review scores.
  - Visual Radial Score Meter and defect discovery summaries.

- **🔍 Side-by-Side Comparison & Debrief:**
  - Post-review comparison view displaying user findings alongside canonical staff reviews.
  - Side-by-side unified code diff inspections highlighting missed vs. caught bugs.

- **📚 Curated Challenge Taxonomy:**
  - Real-world scenarios spanning **Agent Antipatterns**, **Security & Injection Vectors**, and **Concurrency & Async Defects**.
  - Tiered difficulty rankings (`Easy`, `Medium`, `Hard`) with estimated completion times.

- **📖 Interactive API Docs (Scalar):**
  - Fully interactive OpenAPI reference powered by Scalar at `/scalar`.

- **🐳 Production Ready & Containerized:**
  - Optimized multi-stage Docker build with zero-downtime health probes and standalone Next.js deployment.

---

## 🏗️ Architecture

```mermaid
graph TD
    User["👤 Developer / Reviewer"]

    subgraph "Frontend — Next.js 16 (Port 3000)"
        AppRouter["App Router (React 19 Server & Client Components)"]
        Catalog["Challenge Catalog & Filter Bar"]
        Arena["Review Arena & Code Viewer"]
        Stores["Zustand Stores (Arena UI, Review Draft, Auth)"]
        SWR["SWR Data Fetching & Cache"]
    end

    subgraph "Backend — FastAPI & Python (Port 8000)"
        APIRoutes["FastAPI REST Routes (/api/*)"]
        AuthModule["JWT Auth & Session Management"]
        EvalEngine["Automated Defect Evaluation Service"]
        SQLModelORM["SQLModel ORM"]
        ScalarDocs["Scalar OpenAPI Docs (/scalar)"]
    end

    subgraph "Storage & Database"
        DB[(SQLite / PostgreSQL Database)]
        SeedData["Curated Agent Defect Dataset"]
    end

    User -->|Interacts with UI| AppRouter
    AppRouter --> Catalog
    AppRouter --> Arena
    Arena --> Stores
    Stores --> SWR
    SWR -->|HTTP / JSON REST API| APIRoutes

    APIRoutes --> AuthModule
    APIRoutes --> EvalEngine
    APIRoutes --> SQLModelORM

    SQLModelORM --> DB
    SeedData -->|Auto-seed on startup| DB
    APIRoutes --> ScalarDocs
```

---

## 🗂️ Challenge Taxonomy

Diffly provides a growing dataset of curated challenges based on real-world pull requests and autonomous agent code patterns:

| Challenge                                              |       Category       | Difficulty | Focus Area                                                                        |
| :----------------------------------------------------- | :------------------: | :--------: | :-------------------------------------------------------------------------------- |
| **Unsanitized Calculator Tool Execution**              | `Agent Antipatterns` |   `Easy`   | Critical RCE in autonomous agent arithmetic reasoning tool via unvetted `eval()`. |
| **FastAPI Raw SQL Query String Interpolation**         |      `Security`      |   `Easy`   | Unsanitized f-string formatting in database operations allowing SQL injection.    |
| **Next.js React Hook Async State Race Condition**      |    `Concurrency`     |  `Medium`  | Asynchronous state updates causing stale data overrides and race hazards.         |
| **Indirect Prompt Injection in Document Pipeline**     |      `Security`      |   `Hard`   | Data exfiltration and instructions hijack via untrusted processed documents.      |
| **Unhandled Concurrency Exceptions in asyncio.gather** |    `Concurrency`     |  `Medium`  | Silent cascade failures in multi-agent background orchestration pipelines.        |

---

## 🚀 Quickstart

You can run Diffly using **Docker Compose** (recommended for instant setup) or directly on your machine.

### Method 1: Docker Compose (Fastest)

Prerequisites: [Docker & Docker Compose](https://docs.docker.com/get-docker/)

```bash
# 1. Clone the repository
git clone https://github.com/AmirAbaris/diffly.git
cd diffly

# 2. Copy the environment template
cp .env.example .env

# 3. Build and launch all services
docker compose up --build
```

- **Frontend:** [http://localhost:3000](http://localhost:3000)
- **Backend API:** [http://localhost:8000](http://localhost:8000)
- **Interactive API Documentation:** [http://localhost:8000/scalar](http://localhost:8000/scalar)
- **Health Checks:**
  - Frontend: `http://localhost:3000/api/health`
  - Backend: `http://localhost:8000/api/health`

---

### Method 2: Local Development Setup

#### Prerequisites

- **Node.js:** `>= 22.0.0`
- **pnpm:** `>= 9.0.0`
- **Python:** `>= 3.11`

#### 1. Backend Setup

```bash
# Create and activate Python virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt

# Or install editable project with dev dependencies
pip install -e .
```

#### 2. Frontend Setup

```bash
# Install Node dependencies
pnpm install

# Initialize pre-commit git hooks
pnpm prepare
```

#### 3. Environment Variables

```bash
cp .env.example .env
```

Adjust `.env` if desired (defaults work out of the box with SQLite).

#### 4. Run Both Services

Diffly includes a unified runner that boots both Next.js and FastAPI concurrently:

```bash
pnpm dev
```

Or run them individually in separate terminals:

```bash
# Terminal 1: Next.js frontend
pnpm dev:next

# Terminal 2: FastAPI backend
pnpm dev:api
```

---

## ⚙️ Environment Configuration

| Variable | Default | Description |\n| :---------------------------- | :-------------------------------------------- | :----------------------------------------------------------------------- |\n| `DATABASE_URL` | `sqlite:///./diffly.db` | SQLModel database connection string. Supports SQLite and Neon PostgreSQL. |\n| `DB_POOL_SIZE` | `5` | SQLAlchemy connection pool size for PostgreSQL. |\n| `DB_MAX_OVERFLOW` | `10` | Maximum temporary connection overflow above pool size. |\n| `DB_POOL_RECYCLE_SECONDS` | `300` | Recycle connections every 5 minutes to survive Neon scale-to-zero drops. |\n| `DB_POOL_PRE_PING` | `true` | Test connections for liveness before checkout (prevents stale EOF drops).|\n| `JWT_SECRET_KEY` | _(dev key)_ | High-entropy 256-bit token for signing JWTs (`openssl rand -hex 32`). |\n| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm. |\n| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` (7 days) | Token validity window. |\n| `COOKIE_SECURE` | `false` | Enable Secure cookie attribute (set to `true` in production with HTTPS). |\n| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Allowed cross-origin domains (comma-separated or JSON array). |\n| `CORS_ORIGIN_REGEX` | `^https://.*\\.vercel\\.app$` | Regex pattern matching dynamic Vercel preview deployment URLs. |\n| `PORT` | `8000` (API) / `3000` (Next.js) | Network port. |\n| `NODE_ENV` | `development` | Environment mode (`development`, `production`, `test`). |\n| `BACKEND_URL` | `http://localhost:8000` | Backend API URL for frontend proxying (leave unset on Vercel serverless).|\n\n---\n\n## 🚀 Deployment & Production Hosting\n\n### 1. Neon PostgreSQL Integration\nDiffly natively supports Neon serverless PostgreSQL, including PgBouncer pooled endpoints (`-pooler`) and automatic SSL enforcement (`sslmode=require`):\n\n`env\nDATABASE_URL=postgresql://neondb_owner:npg_password@ep-bold-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require\nCOOKIE_SECURE=true\nNODE_ENV=production\n`\n\nTo apply database schemas and seed initial challenges against Neon:\n`bash\npython -m backend.seed.seed_data\n`\n\n### 2. Vercel Deployment (Unified Frontend & Serverless Backend)\nDiffly includes [`vercel.json`](vercel.json) pre-configured with Python serverless rewrites and production security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`).\n\n- Connect the GitHub repository in the Vercel dashboard.\n- Set Environment Variables:\n - `DATABASE_URL`: Your pooled Neon connection string (`...-pooler.region.aws.neon.tech/neondb?sslmode=require`).\n - `JWT_SECRET_KEY`: Generated random 256-bit hex token.\n - `COOKIE_SECURE`: `true`.\n - `CORS_ORIGIN_REGEX`: `^https://.*\\.vercel\\.app$` (allows preview domains).\n - _(Optional)_ `BACKEND_URL`: Leave empty when running FastAPI natively via Vercel serverless functions, or set to your external API URL if hosting FastAPI separately.\n- Deploy with `vercel --prod` or push to your production branch. Verify `/api/health` reports `status: "healthy"` and `database: "connected"`.

---

## 📡 API Overview

Diffly features a fully documented RESTful API. Visit `/scalar` for the interactive playground.

| Method | Endpoint                 | Description                                                                  |
| :----- | :----------------------- | :--------------------------------------------------------------------------- |
| `GET`  | `/api/health`            | Service health status and uptime probe.                                      |
| `GET`  | `/api/challenges`        | List all available code review challenges with metadata.                     |
| `GET`  | `/api/challenges/{slug}` | Retrieve detailed challenge data, threat model, hints, and snippet.          |
| `POST` | `/api/submissions`       | Submit user code review comments and receive instant evaluation results.     |
| `GET`  | `/api/submissions/{id}`  | Fetch past submission evaluation, score breakdown, and canonical review.     |
| `POST` | `/api/auth/register`     | Register a new user account.                                                 |
| `POST` | `/api/auth/login`        | Authenticate user and receive session credentials.                           |
| `GET`  | `/api/user/me`           | Fetch authenticated user profile, completion history, and review statistics. |
| `GET`  | `/scalar`                | Interactive OpenAPI documentation via Scalar.                                |

---

## 🧪 Test Suite & Code Hygiene

Diffly enforces rigorous quality gates across both frontend and backend stacks:

```bash
# Run the complete verification suite (Linters + Pytest + Vitest + Next.js build)
pnpm verify

# Frontend unit & component tests (Vitest)
pnpm test

# Backend test suite with strict coverage enforcement (Pytest >=85% target)
pnpm test:py

# Python linting and formatting (Ruff)
pnpm lint:py

# JavaScript/TypeScript linting (Oxlint + ESLint + React Doctor + Prettier check)
pnpm lint

# Automatic code formatting
pnpm format
```

---

## 📁 Repository Structure

```text
diffly/
├── api/                     # FastAPI route handlers & API dependencies
│   ├── routes/              # Modular endpoints (challenges, submissions, auth, user)
│   ├── deps.py              # Auth and database session dependencies
│   └── index.py             # FastAPI entrypoint, middleware, and Scalar docs
├── backend/                 # Core backend logic
│   ├── core/                # DB engine configuration, settings, security utils
│   ├── models/              # SQLModel database schemas & Pydantic models
│   ├── seed/                # Seed database loader & challenge definitions
│   └── services/            # Automated evaluation and scoring service
├── app/                     # Next.js 16 App Router pages and layouts
│   ├── (catalog)/           # Challenge catalog listing & filters
│   └── challenges/[slug]/   # Interactive Review Arena page
├── components/              # UI Component architecture (≤350 lines per file)
│   ├── auth/                # Modal sign-in / sign-up dialogs
│   ├── challenges/          # Challenge catalog cards, grids, search filters
│   ├── review/              # Review Arena (code viewer, comments drawer, diffs)
│   └── ui/                  # Radix UI + shadcn accessible design system
├── hooks/                   # Custom React hooks (review draft, hints, auth, stats)
├── stores/                  # Zustand global state (UI state, drafts, modals)
├── tests/                   # Full test suite
│   ├── test_*.py            # Pytest suites (API endpoints, models, evaluations)
│   └── frontend/            # Vitest suites for React components and hooks
├── Dockerfile               # Multi-stage container build for frontend and backend
├── docker-compose.yml       # Production-ready orchestration with health checks
├── lefthook.yml             # Fast Git pre-commit hooks
└── package.json             # Scripts, dependencies, and project metadata
```

---

## 🤝 Contributing

We warmly welcome contributions from the community! Whether you want to add new review challenges, enhance the evaluation engine, or improve the UI:

1. **Fork the Repository**
2. **Create a Feature Branch:** `git checkout -b feat/my-new-challenge`
3. **Add / Modify Code:** Ensure changes follow our component architecture guidelines (keep files focused, modular, and under 350 lines).
4. **Verify Quality Checks:**
   ```bash
   pnpm verify
   ```
5. **Open a Pull Request:** Provide a clear description of your challenge or fix.

### Adding New Challenges

To add a challenge, add your scenario to `backend/seed/challenges.py` with:

- Category (`Agent Antipatterns`, `Security`, `Concurrency`, etc.)
- Threat Model & Target Defect explanation
- Unsanitized Code Snippet
- Ground-truth defect line ranges and canonical reviewer feedback

---

## 📄 License

This project is open-source and available under the **[MIT License](LICENSE)**.

---

<p align="center">
  Built with ❤️ for developers and security engineers reviewing code in the age of AI agents.
</p>
