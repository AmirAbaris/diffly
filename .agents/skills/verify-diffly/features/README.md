# Diffly Feature Map

This directory documents the user-facing features of **Diffly** — the developer arena for practicing code review on AI agent codes and pull requests.

## Index of Features

| Feature                                                         | Surface                                      | Description                                                                                               | Proven In                     |
| --------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------- |
| [System Health & Readiness](system-health.md)                   | REST API (`/api/health`)                     | Verifies service state, database connectivity, and seeded challenge availability                          | `scripts/drive.sh health`     |
| [Challenge Catalog](challenge-catalog.md)                       | Web UI / API (`/api/challenges`)             | Lists and filters code review challenges across agent hallucinations, security flaws, and race conditions | `scripts/drive.sh catalog`    |
| [Code Review Evaluation](code-review-evaluation.md)             | Web UI / API (`/api/challenges/{id}/review`) | Evaluates user-flagged lines and review explanations against defect ground truth                          | `scripts/drive.sh review`     |
| [Strict Code Hygiene & Spacing](code-hygiene-and-formatting.md) | CI / Linter (Ruff + Prettier + ESLint)       | Enforces PEP 8 double blank line function spacing, strict TS linting, and automated CI verification       | `scripts/drive.sh formatting` |

## Verification Guidance

1. Always run `.agents/skills/verify-diffly/scripts/doctor.sh` before driving features.
2. Every drive captures dated evidence in `.agents/skills/verify-diffly/evidence/`.
3. Proof artifacts survive `.agents/skills/verify-diffly/scripts/cleanup.sh`.
