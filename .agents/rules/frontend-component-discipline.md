---
description: Frontend component size limits, modular abstraction, and file cleanliness rules
trigger: always_on
---

# Frontend Component Discipline

Keep React component files focused, readable, and under 300 lines of code.

## Component Sizing Limits

- Maximum lines per component file: **350 lines** (enforced by ESLint and Oxlint `max-lines`).
- Preferred component size: **100–250 lines**.
- Never cram multiple distinct visual sections, modals, data parsers, and side-by-side viewports into one 800+ line monolith.

## Decomposition Rules

When a component approaches or exceeds 250 lines, apply these decompositions immediately:

1. **Extract pure algorithms & parsers:** Move pure data transformation functions (e.g., diff parsers, markdown tokenizers, math calculations) to a sibling `.ts` utility or `lib/` helper.
2. **Extract visual subcomponents:** Break distinct UI sections (cards, columns, accordion items, stat meters, modal footers) into dedicated subcomponents in a subfolder (e.g. `components/<feature>/<subcomponent>.tsx`).
3. **Extract custom hooks:** Extract state machines, complex `useEffect` lifecycles, and multi-endpoint data fetching into `hooks/use-<feature>.ts`.
4. **Preserve public API:** The parent component remains the slim orchestrator and re-exports any shared interfaces so existing callers and routes remain unaffected.
