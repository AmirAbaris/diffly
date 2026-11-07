# Feature: System Health & Readiness

## Sub-features

- **Service Liveness:** Answers HTTP GET requests with status 200.
- **Database Connection Check:** Verifies NeonDB (or SQLite dev fallback) connectivity through SQLModel session.
- **Seeded Inventory Count:** Reports count of available code review challenges.

## How to get to it (user POV)

The client or load balancer sends a `GET /api/health` request to verify that the backend is operational and capable of serving challenge review data.

## Driving it with bash / curl

Run the drive harness:

```bash
.agents/skills/verify-diffly/scripts/drive.sh health
```

Or directly via curl:

```bash
curl -s http://127.0.0.1:8000/api/health
```

Expected output:

```json
{
  "status": "healthy",
  "service": "diffly-fastapi",
  "database": "connected",
  "challenges_available": 3
}
```

## Gotchas

- The database tables must be initialized before querying challenge count; `backend/seed.py` runs automatically on lifespan startup or via `scripts/launch.sh`.
