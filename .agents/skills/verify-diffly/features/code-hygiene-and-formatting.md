# Feature: Strict Code Hygiene & Spacing

## Sub-features

- **PEP 8 Spacing Enforcement:** Ruff enforces exact 2 blank lines between top-level functions and classes (`E302`/`E305`).
- **TypeScript Function Spacing & Component Limits:** ESLint enforces `padding-line-between-statements` and a strict 350-line `max-lines` ceiling to prevent oversized monolithic components.
- **Fast Rust Linting:** Oxlint provides immediate sub-second syntax, correctness, and `max-lines` passes.
- **React Best Practices & Diagnostics:** React Doctor scans component architecture, hook conventions, accessibility, and anti-patterns.
- **Prettier & Ruff Formatter Checks:** Automatic CI failure on unformatted code or trailing whitespace.
- **GitHub Actions CI Guardrail:** Pre-merge automation blocking sloppy code on pull requests.

## How to get to it (user POV)

When any code is committed or pushed to a PR, GitHub Actions runs `pnpm verify` (`pnpm lint`, `pnpm test:py`, `pnpm build`). Any violation (such as functions placed directly next to each other without blank lines) fails the build.

## Driving it with bash / curl

Run the drive harness:

```bash
.agents/skills/verify-diffly/scripts/drive.sh formatting
```

Or run directly via npm scripts:

```bash
pnpm lint
pnpm format:check
```

## Gotchas

- Do not bypass linter errors with `# noqa` or `eslint-disable` unless formally justified. Ruff requires 2 blank lines between functions at the module level.
