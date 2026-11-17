---
description: UI, styling, layout, component, and visual design work rules, required design skills, Diffly design language, and visual verification gate
trigger: model_decision
---

# Design Work

Follow these rules for any UI, styling, layout, component, or visual design change.

## Required Design Skills

Before writing UI code, read these skills:

- `web-design-guidelines` (`~/.gemini/antigravity-cli/skills/web-design-guidelines/SKILL.md`)
- `building-components` (`~/.gemini/antigravity-cli/skills/building-components/SKILL.md`)
- `vercel-composition-patterns` (`~/.gemini/antigravity-cli/skills/vercel-composition-patterns/SKILL.md`)
- `vercel-react-best-practices` (`~/.gemini/antigravity-cli/skills/vercel-react-best-practices/SKILL.md`)
- `shadcn` (`~/.agents/skills/shadcn/SKILL.md`)

Subagents do not inherit rules. Name all five skills above in every delegate or subagent brief that touches UI.

## Diffly Design Language

Derive all styling from the tokens and primitives in `app/globals.css` and `components/ui/`.

- **Achromatic palette:** Use semantic CSS tokens (`background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`) mapped in `app/globals.css`. Light and dark themes use zero-chroma neutral OKLCH surfaces.
- **Status accents only:** Use `destructive` for errors/high severity and Tailwind `emerald-*`, `amber-*`, `sky-*`, or `rose-*` scales only for semantic status badges, scores, and diff indicators.
- **No raw colors:** Never write raw hex (`#...`), `rgb()`, `rgba()`, `hsl()`, `hsla()`, or Tailwind arbitrary color classes (`bg-[#...]`, `text-[rgb(...)]`) in `components/**` or `app/**`. ESLint blocks them.
- **shadcn primitives (`radix-vega`):** Compose UI from `components/ui/*` (`Badge`, `Button`, `Card`, `Dialog`, `Empty`, `InputGroup`, `Select`, `Separator`, `Skeleton`, `Tabs`, `ToggleGroup`, `Tooltip`) and use built-in `variant` and `size` props before creating custom elements.
- **Typography:** Use `font-sans` (`GeistSans`) for body copy, `font-mono` (`GeistMono`) for code, language tags, and technical labels, and `font-pixel` (`GeistPixelSquare`) for the `Diffly` wordmark, hero display titles, and key telemetry readouts. Apply `tabular-nums` on numbers, `text-balance` on headings, and `text-pretty` on descriptions.
- **Layout and surfaces:** Use `max-w-6xl mx-auto` containers with `px-4 sm:px-6` gutters, `gap-4` or `gap-6` vertical rhythm, and 1px hairline borders (`border-border`, `border-border/60`). Avoid heavy drop shadows and decorative gradients.
- **Interaction and accessibility:** Include `aria-hidden="true"` on decorative icons, visible focus rings (`focus-visible:ring-[3px] focus-visible:ring-ring/50`), and explicit `aria-label` attributes on icon-only controls.

## Visual Verification Gate

Do not mark UI work done from build or unit tests alone.

1. Capture transient screenshots of affected routes at desktop and mobile viewports using `.agents/skills/verify-diffly/scripts/drive.sh visual` (writes PNGs to `.agents/skills/verify-diffly/.screenshots/<TIMESTAMP>/` and the manifest to `evidence/<TIMESTAMP>_visual.json`; pass `--ephemeral` for telemetry-only runs).
2. Have a fresh agent (not the author) inspect the screenshots in `.screenshots/<TIMESTAMP>/` and the `_visual.json` manifest against the Diffly design language and `web-design-guidelines`, then run `.agents/skills/verify-diffly/scripts/cleanup.sh` (or `--screenshots-only`) to delete transient screenshots while preserving `.json`/`.txt` evidence.
3. Report visual verification status explicitly using `VERIFIED LIVE`, `UNTESTED`, or `FAILED`.
