# Visual Review

Visual review launches the Next.js frontend against the isolated backend, captures full-page desktop and mobile screenshots of key routes and open modals, records DOM overflow and console error metrics, and pairs those artifacts with a fresh-agent design judging checklist.

## Sub-features

- `desktop-and-mobile-capture` renders `/`, `/challenges`, `/challenges/agent-unsanitized-exec`, the open `Diffly Account` modal, and the open `Custom Challenge Generator` modal at `1440x900` and `390x844`.
- `overflow-and-runtime-probe` checks `scrollWidth <= innerWidth`, Next.js error overlays, and browser console/runtime exceptions on every captured state.
- `fresh-agent-design-audit` evaluates captured PNGs against Diffly component discipline and Web Interface Guidelines from an independent reviewer perspective.

## How to get to it (user POV)

- Visit `/` for the landing page, `/challenges` for the catalog, and `/challenges/agent-unsanitized-exec` for the code review arena.
- Click `Sign In` in the navbar to open `[data-testid="auth-modal-content"]`.
- Click `Generate with AI` on `/challenges` to open `[data-testid="custom-challenge-modal-content"]`.

## Driving it with scripts/drive.sh

Preconditions:

- Backend is running against an isolated SQLite DB via `.agents/skills/verify-diffly/scripts/launch.sh` and verified with `scripts/doctor.sh`.
- Local `node_modules` is installed (`pnpm install`) and Google Chrome or Chromium is installed on the host.

- **Capture screenshots and manifest.** Run `.agents/skills/verify-diffly/scripts/drive.sh visual`. Next.js starts on port `3000` (or a free port) with `BACKEND_URL` pointing to the isolated backend, headless Chrome CDP (`scripts/capture_visual.mjs`) captures 10 transient PNGs into `.agents/skills/verify-diffly/.screenshots/<TIMESTAMP>/` (gitignored) plus `evidence/<TIMESTAMP>_visual.json`, and the temporary Next.js server shuts down on exit. Pass `--ephemeral` (or `VERIFY_EPHEMERAL_SCREENSHOTS=1`) for telemetry-only runs that delete PNGs immediately before exiting.
- **Inspect captured evidence.** Open `evidence/<TIMESTAMP>_visual.json` and view each `.screenshots/<TIMESTAMP>/<TIMESTAMP>_visual_<state>_<viewport>.png` artifact using a fresh agent that did not author the UI change.
- **Clean up transient screenshots.** After the fresh-agent visual audit completes, run `.agents/skills/verify-diffly/scripts/cleanup.sh` (or `cleanup.sh --screenshots-only`) to delete all transient screenshots while preserving structured `.json` and `.txt` evidence.

## Fresh-Agent Judging Checklist

A fresh agent (not the author of the UI change) must inspect the captured PNGs and manifest and check every criterion below before reporting `VERIFIED LIVE`:

1. **No broken layouts or horizontal overflow:** `metrics.hasHorizontalOverflow` is `false` on desktop (`1440x900`) and mobile (`390x844`), except intentional scrollable code blocks whose outer page container stays within `innerWidth`. No clipped text, overlapping navbar items, or crushed modal padding.
2. **Design tokens and typography:** Consistent Geist Sans / Mono / Pixel font rendering, crisp contrast in both light and dark surfaces, `tabular-nums` on counts/quota badges, balanced headings without awkward orphans, and zero raw `...` where `…` is expected in loading labels.
3. **Interactive states and modals:** `auth-modal` and `custom-modal` center cleanly on desktop and mobile with readable titles, descriptions, tab triggers (`Sign In` / `Sign Up`, `Create Challenge` / `Manage Library`), visible focus rings (`focus-visible:ring-*`), and unobstructed close controls.
4. **Accessibility and Web Interface Guidelines:** Icon buttons carry `aria-label`, decorative icons use `aria-hidden="true"`, form inputs have clickable labels and clear validation/error banners, and `prefers-reduced-motion` is respected.
5. **Runtime cleanliness:** Zero Next.js error overlays (`hasNextError: false`), non-empty content (`textLength > 40`), and zero unexpected console or uncaught runtime errors in `evidence/<TIMESTAMP>_visual.json`.

## Gotchas

- `next dev` updates `next-env.d.ts` during development runs; `drive.sh visual` restores `next-env.d.ts` on exit if it was clean before the run.
- In a fresh git worktree without `node_modules`, `drive.sh visual` fails fast with an explicit error until `pnpm install --offline` populates `node_modules`.
- If Google Chrome or Chromium is not installed at a standard path, pass `CHROME_BIN=/path/to/chrome` or capture remains `UNTESTED` (report the missing binary explicitly).
