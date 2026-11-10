<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Frontend Component Architecture & Cleanliness

- **Maximum Component Length:** 350 lines hard ceiling (enforced by ESLint and Oxlint `max-lines`). Target 100–250 lines per file.
- **Single Responsibility:** A component file must not contain multiple independent subcomponents, modals, and pure data parsers.
- **Decomposition Mandate:**
  - Extract pure parsers, tokenizers, and math into dedicated `.ts` files.
  - Extract distinct sub-views (dialogs, columns, drawer contents, hero cards) into dedicated subcomponents under a subfolder.
  - Extract state, timers, and storage into custom hooks under `hooks/`.
- **Pre-commit Gate:** Lefthook runs ESLint, Oxlint, Prettier, and React Doctor. Any monolithic component over 350 lines is blocked at commit time.
