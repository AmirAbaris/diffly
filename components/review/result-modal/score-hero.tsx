import * as React from "react"
import { AlertTriangle, Check, ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { RadialScoreMeter } from "./radial-score-meter"
import type { ScoreTierStyle } from "./score-helpers"

export interface ScoreHeroProps {
  score: number
  submissionId: number
  tierStyle: ScoreTierStyle
  summary: string
  detectedCount: number
  missedCount: number
  penalty: string | null
}

export function ScoreHeroSection({
  score,
  submissionId,
  tierStyle,
  summary,
  detectedCount,
  missedCount,
  penalty,
}: ScoreHeroProps) {
  return (
    <div
      data-testid="score-hero-container"
      className="flex flex-col items-center gap-5 rounded-2xl border border-border/70 bg-card/70 p-4 backdrop-blur-xs sm:flex-row sm:items-center sm:gap-6 sm:p-5"
    >
      <RadialScoreMeter score={score} />

      <div className="flex min-w-0 flex-1 flex-col items-center gap-2.5 text-center sm:items-start sm:text-left">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          <Badge
            variant="outline"
            className={cn(
              "gap-1.5 px-2.5 py-0.5 text-xs font-semibold",
              tierStyle.badgeClassName
            )}
          >
            <span
              className={cn("size-1.5 rounded-full", tierStyle.dotClassName)}
            />
            <span>{tierStyle.label}</span>
          </Badge>
          <span className="font-mono text-xs text-muted-foreground">
            Submission #{submissionId}
          </span>
        </div>

        <p className="text-xs leading-relaxed font-medium text-foreground/90">
          {summary}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5 sm:justify-start">
          <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
            <Check className="size-3 text-emerald-500" />
            <span>{detectedCount} detected</span>
          </span>

          <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
            <AlertTriangle className="size-3 text-amber-500" />
            <span>{missedCount} missed</span>
          </span>

          {penalty && (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] text-amber-700 dark:text-amber-300">
              <ShieldAlert className="size-3" />
              <span>{penalty}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
