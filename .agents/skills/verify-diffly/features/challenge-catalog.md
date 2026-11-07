# Feature: Challenge Catalog

## Sub-features

- **Challenge Listing:** Returns available code review challenges with metadata (slug, title, difficulty, category, language).
- **Challenge Detail View:** Returns full code snippet with intentional defects for a selected challenge.
- **Difficulty and Category Filtering:** Categorizes challenges into Agent Antipaths, Security, and Concurrency.

## How to get to it (user POV)

Users open the Diffly web app (or `GET /api/challenges`). They see a list of PR/code review challenges, select a card, and see the full code snippet with line numbers ready for inspection.

## Driving it with bash / curl

Run the drive harness:

```bash
.agents/skills/verify-diffly/scripts/drive.sh catalog
```

Or query challenge detail:

```bash
curl -s http://127.0.0.1:8000/api/challenges/1
```

Expected output includes the title, language (`python` or `typescript`), and `code_snippet`.

## Gotchas

- Challenges are seeded on startup. If running on a brand-new NeonDB database, ensure `DATABASE_URL` is set and migrations/seed script executed.
