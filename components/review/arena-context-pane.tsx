"use client"

import * as React from "react"
import {
  AlertTriangle,
  Bot,
  Clock,
  Cpu,
  FileCode,
  Info,
  Lightbulb,
  ShieldAlert,
  Terminal,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { ChallengeDetail } from "@/types/challenge"

export interface ArenaContextPaneProps {
  challenge?: ChallengeDetail | null
  isLoading?: boolean
}

export function ArenaContextPane({
  challenge,
  isLoading,
}: ArenaContextPaneProps) {
  if (isLoading || !challenge) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-20 w-full" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-28 w-full" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    )
  }

  const isPython = challenge.language === "python"

  return (
    <div
      data-testid="arena-context-pane"
      className="flex flex-col gap-6 p-4 sm:p-6"
    >
      {/* Section 1: Scenario Overview & Threat Model */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Info className="size-4" />
          </div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Scenario Context
          </h2>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-foreground">
              Operational Objective
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed text-muted-foreground">
              {challenge.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-0">
            {challenge.defect_target && (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <div>
                  <span className="font-semibold">Target Defect: </span>
                  <span>{challenge.defect_target}</span>
                </div>
              </div>
            )}

            {challenge.threat_model && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-border/80 bg-muted/40 p-3 text-xs">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <ShieldAlert className="size-3.5 text-destructive" />
                  <span>Threat Model & Invariants</span>
                </div>
                <p className="leading-relaxed text-muted-foreground">
                  {challenge.threat_model}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Section 2: Agent Execution Environment */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bot className="size-4" />
          </div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Agent Execution Environment
          </h2>
        </div>

        <Card>
          <CardContent className="grid grid-cols-2 gap-3 p-4">
            <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Terminal className="size-3.5" />
                Runtime
              </span>
              <span className="text-xs font-semibold text-foreground capitalize">
                {isPython ? "Python 3.12 (Sandbox)" : "Node.js 22 (V8)"}
              </span>
            </div>

            <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" />
                Review Time
              </span>
              <span className="text-xs font-semibold text-foreground">
                ~{challenge.estimated_minutes} minutes
              </span>
            </div>

            <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileCode className="size-3.5" />
                Code Size
              </span>
              <span className="text-xs font-semibold text-foreground">
                {challenge.line_count} lines
              </span>
            </div>

            <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lightbulb className="size-3.5" />
                Tiered Hints
              </span>
              <span className="text-xs font-semibold text-foreground">
                {challenge.total_hints} available
              </span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Section 3: Rules of Engagement */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Cpu className="size-4" />
          </div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Rules of Engagement
          </h2>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-3 p-4 text-xs text-muted-foreground">
            <div className="flex items-start gap-2.5">
              <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                1
              </div>
              <p className="leading-relaxed">
                <strong className="text-foreground">
                  Identify Vulnerabilities:
                </strong>{" "}
                Inspect the implementation for unsanitized execution, race
                conditions, or unhandled tool failures.
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                2
              </div>
              <p className="leading-relaxed">
                <strong className="text-foreground">
                  Flag Offending Lines:
                </strong>{" "}
                Click any line number in the code viewer to target exact defect
                locations.
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                3
              </div>
              <p className="leading-relaxed">
                <strong className="text-foreground">Formulate Critique:</strong>{" "}
                Annotate your critique in the comment drawer detailing security
                risk, blast radius, and fix suggestions.
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                4
              </div>
              <p className="leading-relaxed">
                <strong className="text-foreground">
                  Automated Evaluation:
                </strong>{" "}
                Your critique will be evaluated against ground-truth defect
                criteria and canonical recommendations.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
