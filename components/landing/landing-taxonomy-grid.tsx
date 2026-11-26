import * as React from "react"
import Link from "next/link"
import { ArrowRight, Cpu, Layers, ShieldAlert, Workflow } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const TAXONOMY_SPEC_COLUMNS = [
  {
    code: "01 // TOOL_ESCAPES",
    title: "Sandbox Escapes",
    icon: Cpu,
    metrics: "Python · TS · Go",
    description:
      "Agents bypass validators with eval(), shell calls, and unverified tool args.",
    examples: [
      "eval() gadget chains",
      "Indirect prompt injection",
      "Unbounded retry loops",
    ],
  },
  {
    code: "02 // RACE_WINDOWS",
    title: "Async Race Windows",
    icon: Workflow,
    metrics: "React · FastAPI · Redis",
    description:
      "Check-then-act reads, stale closures, and swallowed async errors.",
    examples: [
      "Non-atomic Redis locks",
      "Stale React effect state",
      "Swallowed gather() errors",
    ],
  },
  {
    code: "03 // AUTH_DRIFT",
    title: "Injection & Auth Drift",
    icon: ShieldAlert,
    metrics: "SQL · JWT · Next.js",
    description:
      "Interpolated sort columns, unvalidated redirects, and missing tenant checks.",
    examples: [
      "Dynamic ORDER BY SQLi",
      "Unvalidated webhook SSRF",
      "Missing tenant predicates",
    ],
  },
] as const

const PIPELINE_STEPS = [
  {
    step: "01",
    label: "Read the Diff",
    detail: "Inspect the threat model and agent PR.",
  },
  {
    step: "02",
    label: "Flag Defect Lines",
    detail: "Pinpoint root-cause lines without noise.",
  },
  {
    step: "03",
    label: "Get F1 Score",
    detail: "Graded on exact lines or Gemini BYOK.",
  },
] as const

export function LandingTaxonomyGrid() {
  return (
    <section
      aria-labelledby="taxonomy-heading"
      data-testid="landing-taxonomy-section"
      className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16"
    >
      <div className="flex flex-col justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <Layers className="size-3.5" aria-hidden="true" />
            <span>DEFECT_TAXONOMY</span>
          </div>
          <h2
            id="taxonomy-heading"
            className="font-pixel text-2xl tracking-tight text-balance text-foreground sm:text-3xl"
          >
            What You Catch.
          </h2>
        </div>
        <p className="max-w-md text-xs leading-relaxed text-pretty text-muted-foreground sm:text-sm">
          Linters check syntax. Diffly trains you on the bugs that pass CI.
        </p>
      </div>

      <div className="grid grid-cols-1 border-t border-l border-border md:grid-cols-3">
        {TAXONOMY_SPEC_COLUMNS.map((item) => {
          const Icon = item.icon

          return (
            <article
              key={item.code}
              className="@container flex min-w-0 flex-col justify-between border-r border-b border-border bg-card/30 p-5 lg:p-6"
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 @md:flex-row @md:items-center @md:justify-between">
                  <span className="font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                    {item.code}
                  </span>
                  <Badge
                    variant="outline"
                    className="w-fit font-mono text-[10px]"
                  >
                    {item.metrics}
                  </Badge>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                    <Icon
                      className="size-4 text-foreground"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="font-pixel text-lg leading-snug text-foreground">
                    {item.title}
                  </h3>
                </div>

                <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  {item.description}
                </p>
              </div>

              <ul className="mt-6 flex flex-col gap-2 border-t border-border/70 pt-4 font-mono text-[11px] text-foreground/85">
                {item.examples.map((example) => (
                  <li key={example} className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      className="text-muted-foreground select-none"
                    >
                      +
                    </span>
                    <span>{example}</span>
                  </li>
                ))}
              </ul>
            </article>
          )
        })}
      </div>

      <div className="grid grid-cols-1 items-center gap-6 rounded-lg border border-border bg-muted/15 p-6 lg:grid-cols-4">
        <div className="flex flex-col gap-2 lg:col-span-1">
          <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
            EVALUATION_LOOP
          </span>
          <h3 className="font-pixel text-xl text-foreground">
            Scored Line by Line
          </h3>
          <p className="text-xs leading-relaxed text-pretty text-muted-foreground">
            Flagging every line tanks precision.
          </p>
          <div className="pt-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/challenges">
                <span>Browse Challenges</span>
                <ArrowRight aria-hidden="true" data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-3">
          {PIPELINE_STEPS.map((item) => (
            <div
              key={item.step}
              className="flex flex-col gap-1.5 rounded-md border border-border bg-background p-4"
            >
              <span className="font-pixel text-xs text-muted-foreground">
                {item.step}
              </span>
              <div className="text-sm font-semibold text-foreground">
                {item.label}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
