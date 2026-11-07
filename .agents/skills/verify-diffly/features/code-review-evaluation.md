# Feature: Code Review Evaluation

## Sub-features

- **Line Pinpointing:** User specifies line number(s) where defects exist.
- **Defect Pattern Matching:** Keyword and explanation analysis matching the root defect (e.g., RCE, SQL injection, async race condition).
- **Scoring & Feedback Engine:** Assigns 0-100 score and returns contextual feedback with list of detected issues.
- **Submission History Persistence:** Stores review submissions in SQLModel database for tracking review progress.

## How to get to it (user POV)

In the Diffly review workspace:

1. User reads the AI agent or PR code snippet.
2. User clicks the line number containing the bug (e.g. line 5 `eval(user_expression)`).
3. User writes their code review comment explaining why it's a security risk.
4. User clicks "Submit Review" and instantly sees their score (e.g. 100/100) and feedback.

## Driving it with bash / curl

Run the drive harness:

```bash
.agents/skills/verify-diffly/scripts/drive.sh review
```

Or submit via curl:

```bash
curl -s -X POST http://127.0.0.1:8000/api/challenges/1/review \
  -H "Content-Type: application/json" \
  -d '{"flagged_lines": [5], "comments": "Line 5 uses eval directly, causing Remote Code Execution (RCE) on user input."}'
```

Expected output:

```json
{
  "submission_id": 1,
  "score": 100,
  "feedback": "Outstanding review! You caught the critical defects.",
  "detected_issues": [
    "Accurately identified: Direct use of eval() on user input allows Remote Code Execution (RCE)."
  ]
}
```

## Gotchas

- Submitting an empty comment or empty flagged lines results in a score of 0. Both line number and root cause explanation are factored into the score.
