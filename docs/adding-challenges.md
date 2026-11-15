# Content-as-code challenge authoring guide

Diffly loads curated code review challenges from directory bundles under `content/challenges/<slug>/`. The loader in `backend/seed/loader.py` reads each bundle, validates enum values against `backend/models/challenge.py`, and seeds records into the database through `backend/seed/seed_data.py`.

## Bundle layout

Each challenge lives in its own directory named after its slug:

```text
content/challenges/<slug>/
  meta.yaml
  description.md
  snippet.<ext>
  canonical_review.md   # optional fallback
  fix.diff              # optional fallback
```

Required files in every bundle:

- `meta.yaml` (or `meta.yml`) holds metadata, `expected_issues`, `hints`, `canonical_review`, and `recommended_fix_diff`.
- `description.md` holds the problem context and the threat model section.
- `snippet.<ext>` holds the raw vulnerable source file using `.py`, `.ts`, `.go`, or `.rs`.

Optional fallback files when `meta.yaml` omits the corresponding inline fields:

- `canonical_review.md` (also checked as `solution.md` or `review.md`) supplies `canonical_review`.
- `fix.diff` (also checked as `diff.patch` or `recommended_fix.diff`) supplies `recommended_fix_diff`.

When both the inline field in `meta.yaml` and a fallback file are present, `load_challenge_bundle()` keeps the inline value from `meta.yaml`.

## Schema reference for `meta.yaml`

`load_challenge_bundle()` parses `meta.yaml` with `yaml.safe_load` and normalizes fields for `Challenge` in `backend/models/challenge.py`.

### Top-level fields

| Field               | Type    | Required | Description                                                                                                           |
| ------------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `order`             | integer | No       | Sort key used by `load_challenges_from_dir()` to order challenges by `(order, slug)`. Defaults to `999`.              |
| `slug`              | string  | Yes      | Unique kebab-case identifier. Must match the directory name under `content/challenges/`.                              |
| `title`             | string  | Yes      | Display title shown in the challenge catalog and workspace.                                                           |
| `difficulty`        | string  | Yes      | Matches `Difficulty` (`Easy`, `Medium`, or `Hard`). YAML parsing accepts lowercase values (`easy`, `medium`, `hard`). |
| `category`          | string  | Yes      | Matches `Category`. See accepted canonical values and aliases below.                                                  |
| `language`          | string  | Yes      | Matches `Language` (`python`, `typescript`, `go`, or `rust`), matched case-insensitively.                             |
| `estimated_minutes` | integer | No       | Estimated review duration in minutes. Defaults to `5`.                                                                |
| `defect_target`     | string  | No       | Short objective shown in the workspace header, such as `Find 1 Critical RCE Vulnerability in agent tool execution`.   |

`Category` in `backend/models/challenge.py` defines five canonical values:

- `Agent Antipaths`
- `Security`
- `Concurrency`
- `Performance`
- `Logic Flaws`

`Category._missing_()` normalizes hyphens and underscores to spaces in a case-insensitive lookup. In `meta.yaml`, you can use canonical titles or these accepted aliases:

- `agent_antipatterns`, `agent-antipattern`, `agent_antipaths`, `agent-antipath` (maps to `Agent Antipaths`)
- `security`, `security_vuln`, `security_vulnerability` (maps to `Security`)
- `concurrency`, `concurrency_race` (maps to `Concurrency`)
- `performance` (maps to `Performance`)
- `logic_flaws`, `logic_flaw` (maps to `Logic Flaws`)

### Expected issues

`expected_issues` requires at least one item in `tests/test_seed.py`. Each item validates against `DefectCriterion` in `backend/models/challenge.py`.

| Field              | Type          | Required | Description                                                                                                          |
| ------------------ | ------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `id`               | string        | Yes      | Non-empty identifier for the defect, such as `crit-rce-eval`.                                                        |
| `title`            | string        | Yes      | Short defect title shown in evaluation results.                                                                      |
| `severity`         | string        | Yes      | Must be `low`, `medium`, `high`, or `critical`.                                                                      |
| `matched_lines`    | list[integer] | Yes      | 1-indexed line numbers in `snippet.<ext>` that contain the defect. `DefectCriterion` also accepts `lines` or `line`. |
| `matched_keywords` | list[string]  | Yes      | Concept terms checked against the reviewer's comment text. `DefectCriterion` also accepts `keywords`.                |
| `line_score`       | float         | No       | Per-defect weight annotation stored as an extra field on `DefectCriterion` (curated bundles use `0.6`).              |
| `concept_score`    | float         | No       | Per-defect weight annotation stored as an extra field on `DefectCriterion` (curated bundles use `0.4`).              |
| `explanation`      | string        | Yes      | Root-cause explanation returned in detected and missed defect feedback.                                              |

`DefectCriterion` sets `ConfigDict(extra="allow")`, so `line_score` and `concept_score` stay attached to the serialized JSON payload. When scoring a submission at runtime, `evaluate_review()` in `backend/services/evaluation_service.py` defaults to `line_weight=0.5` and `concept_weight=0.5`.

### Progressive hints

`tests/test_seed.py` requires exactly three `hints` entries with `tier` values `[1, 2, 3]` in order. Each entry validates against `HintItem` in `backend/models/challenge.py`.

| Field   | Type    | Required | Description                                                                                                    |
| ------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `tier`  | integer | Yes      | Progressive tier number (`1`, `2`, then `3`).                                                                  |
| `title` | string  | No       | Tier heading (`label` is also accepted). Defaults to `Contextual clue`, `Vulnerability class`, `Line pointer`. |
| `hint`  | string  | Yes      | Non-empty guidance text (`text`, `content`, or `description` are also accepted).                               |

Curated bundles use three tiers:

1. Tier 1 (`Contextual Clue`) points the reviewer toward the risky subsystem or data flow without naming the vulnerability.
2. Tier 2 (`Vulnerability Class`) names the defect category or failure mode.
3. Tier 3 (`Line Pointer & Guidance`) cites the exact line range and describes the safe fix.

### Solution fields

`canonical_review` holds the staff-level review critique and remediation notes. Use a YAML `|-` block scalar in `meta.yaml`, or place the text in `canonical_review.md`.

`recommended_fix_diff` holds a unified diff showing the fix. `tests/test_seed.py` verifies that `recommended_fix_diff` contains at least one `@@` hunk header. Use a YAML `|` block scalar in `meta.yaml`, or place the patch in `fix.diff`.

### Example `meta.yaml`

This example adapts `content/challenges/agent-credential-leak/meta.yaml`:

```yaml
order: 6
slug: agent-credential-leak
title: Ambient Credential Leakage in Agent Context Window
difficulty: medium
category: agent_antipatterns
language: typescript
estimated_minutes: 7
defect_target: Find 1 High Severity Credential Leak in Agent Context Builder
expected_issues:
  - id: high-agent-credential-leak
    title: Ambient Secrets and Tokens Injected into LLM Context
    severity: high
    matched_lines:
      - 26
      - 27
      - 28
      - 29
      - 30
      - 31
      - 32
      - 33
    matched_keywords:
      - process.env
      - credential leak
      - authorization
      - context window
      - secrets
      - prompt injection
    line_score: 0.6
    concept_score: 0.4
    explanation: Serializing `process.env` and incoming `authorization` headers into the agent's system prompt leaks sensitive environment secrets and bearer tokens to the LLM vendor, prompt injection attacks, and client responses.
hints:
  - tier: 1
    title: Contextual Clue
    hint: Examine what ambient data and request headers are concatenated into the `systemPrompt` template.
  - tier: 2
    title: Vulnerability Class
    hint: Sensitive data exposure and credential leakage in LLM context windows allows manipulated models to exfiltrate infrastructure secrets.
  - tier: 3
    title: Line Pointer & Guidance
    hint: Look at lines 26-33. Passing `JSON.stringify(process.env)` and `req.headers.authorization` into the LLM system prompt exposes private API keys and tokens. Strip all ambient secrets and supply only whitelisted context variables.
canonical_review: |-
  Senior Staff Engineer Review Critique:
  Serializing ambient process environment variables (`process.env`) and raw incoming authentication headers (`req.headers.authorization`) into the LLM system context is a high-severity security vulnerability.

  Recommendation:
  Remove `process.env` and raw `authorization` headers from system prompts. Pass only explicitly whitelisted, non-sensitive session metadata required for the agent's task.
recommended_fix_diff: |
  --- a/services/agent.ts
  +++ b/services/agent.ts
  @@ -25,9 +25,4 @@
  -  const runtimeEnv = JSON.stringify(process.env);
  -  const authHeader = req.headers.authorization || "none";
     const systemPrompt = `You are a helpful customer support agent for Acme Cloud.
   Session ID: ${sessionId}
   User ID: ${userId}
  -Auth Token: ${authHeader}
  -Environment Configuration: ${runtimeEnv}
   Answer user questions accurately while following Acme safety policies.`;
```

## Structure of `description.md`

`parse_description_md()` in `backend/seed/loader.py` splits `description.md` into `(description, threat_model)`:

1. It searches for a level 1 to 3 Markdown heading starting with `Threat Model` (matched case-insensitively with `^#{1,3}\s*threat\s*model\b`). Text from that heading to the next level 1 to 3 heading, or to the end of the file, becomes `threat_model`.
2. In the text before `Threat Model`, it looks for a level 1 to 3 heading named `Description`, `Problem Statement`, or `Context`. If found, the text inside that section becomes `description`.
3. If none of those description headings exist, `parse_description_md()` strips a leading `# <Title>` line if present and uses the remaining text as `description`.

Use this structure for new challenges:

```markdown
# <Challenge Title>

## Description

Describe the service, endpoint, or agent workflow under review and what the code tries to do.

## Threat Model

Describe who controls the untrusted input, what privilege boundary breaks, and what an attacker gains.
```

## Constraints on `snippet.<ext>`

`load_challenge_bundle()` loads the first file matching `snippet.*` whose suffix is not `.yaml`, `.yml`, `.md`, `.json`, or `.diff`. `tests/test_seed.py` enforces four rules on every `snippet.<ext>` file under `content/challenges/`:

- Each bundle has exactly one snippet file with extension `.py`, `.ts`, `.go`, or `.rs`.
- The file contains raw multiline source code with more than 5 lines (`len(lines) > 5`).
- The file does not start with triple-quote or tuple wrappers (`"""`, `'''`, `("`, or `('`).
- Python snippets (`snippet.py`) parse without syntax errors under `ast.parse()`.

Keep line numbers deterministic when editing `snippet.<ext>`. Every integer in `expected_issues[].matched_lines` must match the 1-indexed lines of the defect in `snippet.<ext>`.

## Step-by-step authoring workflow

Follow these steps to add, seed, test, and inspect a challenge locally.

1. Create the bundle directory and files under `content/challenges/<slug>/`:

```sh
mkdir -p content/challenges/my-new-challenge
```

Add `meta.yaml`, `description.md`, and `snippet.<ext>` inside that directory. Choose an `order` value after existing challenges so catalog sorting stays predictable.

2. Seed the local database from the repository root:

```sh
.venv/bin/python -m backend.seed.seed_data
```

`seed_challenges()` runs an idempotent upsert keyed by `slug`. Existing public challenges update in place, and any private custom challenge sharing the same slug is preserved under a disambiguated slug.

3. Run the Content-as-Code and challenge API tests:

```sh
.venv/bin/pytest tests/test_seed.py tests/test_challenges.py
```

Both suites derive expected counts dynamically from `CHALLENGES_DATA` and validate your bundle's enum values, line number bounds, three hint tiers, and unified diff hunk headers automatically. Run `pnpm verify:py` to confirm Ruff linting, formatting, and the full Python suite still meet the 85% coverage threshold.

4. Inspect the challenge in the running app:

```sh
pnpm dev
```

`pnpm dev` starts Next.js on `http://localhost:3000` and FastAPI on `http://localhost:8000`. Open the challenge workspace, verify that line numbers in the code viewer match `matched_lines`, reveal all three hint tiers in order, and test submitting both an accurate review and a review with false positives to verify `evaluation_service.py` feedback and `canonical_review` rendering.

## Quality checklist for challenge PRs

Confirm every item before opening a pull request:

- Directory name under `content/challenges/` matches `meta.yaml` `slug` in kebab-case.
- `meta.yaml` uses valid `Difficulty`, `Category`, and `Language` values and includes `defect_target` and `estimated_minutes`.
- `snippet.<ext>` has more than 5 lines, compiles or parses cleanly, and has no string-wrapper quotes.
- `expected_issues` has at least one defect with a unique `id`, valid `severity` (`low`, `medium`, `high`, or `critical`), accurate 1-indexed `matched_lines`, relevant `matched_keywords`, and a clear `explanation`.
- `hints` has all three tiers (`1`, `2`, `3`) progressing from context to vulnerability class to line pointer and fix guidance.
- `canonical_review` explains the root cause and safe remediation.
- `recommended_fix_diff` is a unified diff with `@@` hunk headers that fixes the defect in `snippet.<ext>`.
- `description.md` includes both problem context and a `## Threat Model` section.
- `.venv/bin/pytest tests/test_seed.py tests/test_challenges.py` and `pnpm verify:py` pass cleanly.
