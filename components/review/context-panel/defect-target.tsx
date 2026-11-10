import * as React from "react"
import { AlertTriangle, Sparkles } from "lucide-react"
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-4" />
          </div>
          <h2
            id="defect-target-heading"
            className="text-sm font-semibold tracking-tight text-foreground sm:text-base"
          >
            Defect Target
          </h2>
        </div>
        <Badge
          variant="outline"
          className="border-amber-500/30 bg-amber-500/10 text-[10px] font-semibold text-amber-700 dark:text-amber-400"
        >
          Evaluation Objective
        </Badge>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 shadow-xs dark:bg-amber-500/15 dark:text-amber-200">
        <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">
          <Sparkles className="size-3" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-semibold tracking-tight">
            Primary Defect Goal:
          </span>
          <p className="leading-relaxed font-medium">
            {challenge.defect_target ||
              "Find 1 Critical Vulnerability in tool execution."}
          </p>
        </div>
      </div>
    </section>
  )
}
