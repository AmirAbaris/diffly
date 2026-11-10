# Diffly Feature Map

This directory documents the active features of **Diffly**.

## Index of Features

| Feature                                                         | Surface                                                                   | Description                                                       | Proven In                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------- |
| [System Health & Readiness](system-health.md)                   | REST API (`/api/health`)                                                  | Verifies service liveness and responsiveness                      | `scripts/drive.sh health`     |
| [Strict Code Hygiene & Spacing](code-hygiene-and-formatting.md) | Multi-tier Linter & CI (Ruff + Oxlint + React Doctor + ESLint + Prettier) | Enforces PEP 8 spacing, React best practices, and CI verification | `scripts/drive.sh formatting` |

## Verification Guidance

1. Always run `.agents/skills/verify-diffly/scripts/doctor.sh` before driving features.
2. Every drive captures dated evidence in `.agents/skills/verify-diffly/evidence/`.
3. Proof artifacts survive `.agents/skills/verify-diffly/scripts/cleanup.sh`.
