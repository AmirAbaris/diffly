import * as React from "react"
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
      className="flex flex-col items-center gap-5 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5"
    >
      <RadialScoreMeter score={score} />

      <div className="flex min-w-0 flex-1 flex-col items-center gap-2.5 text-center sm:items-start sm:text-left">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          <Badge
            variant="outline"
            className={cn(
              "gap-1.5 px-2.5 py-0.5 text-xs font-medium",
              tierStyle.badgeClassName
            )}
          >
            <span
              className={cn("size-1.5 rounded-full", tierStyle.dotClassName)}
            />
            <span>{tierStyle.label}</span>
          </Badge>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            Submission #{submissionId}
          </span>
        </div>

        <p className="text-xs leading-relaxed text-foreground/90">{summary}</p>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5 sm:justify-start">
          <Badge
            variant="secondary"
            size="sm"
            className="font-mono tabular-nums"
          >
            {detectedCount} detected
          </Badge>

          <Badge
            variant="secondary"
            size="sm"
            className="font-mono tabular-nums"
          >
            {missedCount} missed
          </Badge>

          {penalty && (
            <Badge
              variant="warning"
              size="sm"
              className="font-mono tabular-nums"
            >
              {penalty}
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}
