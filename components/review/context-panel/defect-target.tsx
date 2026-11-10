import * as React from "react"
import { Badge } from "@/components/ui/badge"
import type { ChallengeDetail } from "@/types/challenge"

export function DefectTargetSection({
  challenge,
}: {
  challenge: ChallengeDetail
}) {
  return (
    <section
      data-testid="section-defect-target"
      aria-labelledby="defect-target-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          id="defect-target-heading"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          Defect Target
        </h2>
        <Badge variant="warning" size="sm">
          Evaluation Objective
        </Badge>
      </div>

      <div className="flex flex-col gap-1 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5 text-xs text-foreground">
        <span className="font-semibold tracking-tight text-amber-800 dark:text-amber-300">
          Primary Defect Goal
        </span>
        <p className="leading-relaxed text-muted-foreground">
          {challenge.defect_target ||
            "Find 1 Critical Vulnerability in tool execution."}
        </p>
      </div>
    </section>
  )
}
