import * as React from "react"
import { Clock, Cpu, FileCode, Terminal } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import type { ChallengeDetail } from "@/types/challenge"

export function EnvironmentSpecsSection({
  challenge,
}: {
  challenge: ChallengeDetail
}) {
  const isPython = challenge.language === "python"

  return (
    <section
      data-testid="section-environment-specs"
      aria-labelledby="environment-specs-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Cpu className="size-4" />
        </div>
        <h2
          id="environment-specs-heading"
          className="text-sm font-semibold tracking-tight text-foreground sm:text-base"
        >
          Execution Specs & Rules
        </h2>
      </div>

      <Card className="border-border/80 bg-card">
        <CardContent className="grid grid-cols-2 gap-2.5 p-3.5 sm:grid-cols-3">
          <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/20 p-2.5">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Terminal className="size-3" />
              Runtime
            </span>
            <span className="text-xs font-semibold text-foreground capitalize">
              {isPython ? "Python 3.12" : "Node.js 22"}
            </span>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/20 p-2.5">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock className="size-3" />
              Review Est.
            </span>
            <span className="text-xs font-semibold text-foreground">
              ~{challenge.estimated_minutes} min
            </span>
          </div>

          <div className="col-span-2 flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/20 p-2.5 sm:col-span-1">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <FileCode className="size-3" />
              Target Code
            </span>
            <span className="text-xs font-semibold text-foreground">
              {challenge.line_count} lines
            </span>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
