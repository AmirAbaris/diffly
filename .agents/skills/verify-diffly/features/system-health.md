# Feature: System Health & Readiness

## Sub-features

- **Service Liveness:** Answers HTTP GET requests with status 200.
- **Service Identifier:** Confirms identity as `diffly-fastapi`.

## How to get to it (user POV)

Clients and uptime monitors send a `GET /api/health` request to verify that the backend is operational.

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
{ "status": "healthy", "service": "diffly-fastapi" }
```

## Gotchas

- Ensure port 8000 is open and not occupied before running `scripts/launch.sh`.
