# Feature: System Health & Readiness

## Sub-features

- **Service Liveness & Readiness:** Answers `GET /api/health` with HTTP `200` when the FastAPI app and SQLite database query succeed, or HTTP `503` (`status: "unhealthy"`, `database: "disconnected"`, `challenge_count: 0`) if the database query fails.
- **Service Identifier & Seeded Catalog Count:** Confirms `service: "diffly-fastapi"`, `database: "connected"`, positive seeded public `challenge_count`, and `uptime_seconds`.

## How to get to it (user POV)

Clients and uptime monitors send a `GET /api/health` request (directly to FastAPI or proxied through Next.js rewrites) to verify that the backend and database are operational.

## Driving it with bash / curl

Run the drive harness:

```bash
.agents/skills/verify-diffly/scripts/drive.sh health
```

Or directly via curl against the active verification port:

```bash
curl -s "http://127.0.0.1:$(cat .agents/skills/verify-diffly/.pids/backend.port)/api/health"
```

Expected output:

```json
{
  "status": "healthy",
  "service": "diffly-fastapi",
  "database": "connected",
  "challenge_count": 31,
  "uptime_seconds": 0.3
}
```

## Gotchas

- `scripts/launch.sh` prefers port `8000` when free and automatically falls back to an ephemeral port unless `PORT` is explicitly set; read `.agents/skills/verify-diffly/.pids/backend.port` when curling directly.
