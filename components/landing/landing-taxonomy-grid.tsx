import * as React from "react"
import Link from "next/link"
import { ArrowRight, Cpu, Layers, ShieldAlert, Workflow } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const TAXONOMY_SPEC_COLUMNS = [
  {
    code: "01 // AGENT_ANTIPATTERNS",
    title: "Autonomous Tool & Sandbox Escapes",
    icon: Cpu,
    metrics: "Python · TypeScript · Go",
    description:
      "Agents frequently bypass AST validators with raw eval(), shell interpolation, or unverified tool-call arguments. Diffly tests whether you catch execution sinks disguised as helper refactors.",
    examples: [
      "Unsanitized Python eval() gadget chains in math tools",
      "Indirect prompt injection in RAG document pipelines",
      "Unbounded recursion in autonomous retry loops",
    ],
  },
  {
    code: "02 // CONCURRENCY_HAZARDS",
    title: "Async State & Lock Race Windows",
    icon: Workflow,
    metrics: "React 19 · FastAPI · Redis",
    description:
      "LLM-generated async handlers routinely split atomic operations into separate check-then-act reads and writes. Spot stale closure captures, missing cancellation tokens, and swallowed gather exceptions.",
    examples: [
      "TOCTOU Redis lock checks in payment webhook handlers",
      "React async effect race conditions overwriting fresh state",
      "Silent task failures in asyncio.gather pipelines",
    ],
  },
  {
    code: "03 // SECURITY_BOUNDARIES",
    title: "Injection Sinks & Auth Drift",
    icon: ShieldAlert,
    metrics: "SQLModel · JWT · Next.js",
    description:
      "Even when parameterized queries protect WHERE clauses, agents interpolate sort columns, tenant headers, or redirect URLs directly. Audit subtle trust-boundary violations line by line.",
    examples: [
      "f-string SQL injection inside dynamic ORDER BY clauses",
      "SSRF via unvalidated upstream webhook redirect targets",
      "Missing tenant isolation predicates on bulk mutations",
    ],
  },
] as const

const PIPELINE_STEPS = [
  {
    step: "STEP_01",
    label: "Inspect Realistic Agent PR",
    detail:
      "Read the threat model, environment specs, and unified or split diff exactly as it lands in code review.",
  },
  {
    step: "STEP_02",
    label: "Flag Exact Defect Lines",
    detail:
      "Attach line-scoped review annotations explaining the root cause and failure mode without noisy false alarms.",
  },
  {
    step: "STEP_03",
    label: "Score Precision, Recall & F1",
    detail:
      "Diffly evaluates your annotations against deterministic line-range and keyword rules or live Gemini BYOK grading.",
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
            <span>DEFECT_TAXONOMY // BENCHMARK_SPECIFICATION</span>
          </div>
          <h2
            id="taxonomy-heading"
            className="font-pixel text-2xl tracking-tight text-balance text-foreground sm:text-3xl"
          >
            Engineered for Post-AI Code Review.
          </h2>
        </div>
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground sm:text-sm">
          Syntax linters catch missing semicolons. Diffly trains engineers on
          the structural failure modes that pass CI and break production.
        </p>
      </div>

      <div className="grid grid-cols-1 border-t border-l border-border md:grid-cols-3">
        {TAXONOMY_SPEC_COLUMNS.map((item) => {
          const Icon = item.icon

          return (
            <article
              key={item.code}
              className="flex flex-col justify-between border-r border-b border-border bg-card/30 p-6"
            >
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {item.code}
                  </span>
                  <Badge variant="outline" className="font-mono text-[10px]">
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
            Deterministic Scoring Protocol
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Every submission computes exact line-level precision and recall so
            guessing every line tanks your score.
          </p>
          <div className="pt-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/challenges">
                <span>Browse All Challenges</span>
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
