import * as React from "react"
import { cn } from "@/lib/utils"
import { getScoreTierStyle } from "./score-helpers"

export function RadialScoreMeter({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  const radius = 44
  const strokeWidth = 7
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (clamped / 100) * circumference
  const tierStyle = getScoreTierStyle(clamped)

  return (
    <div
      data-testid="radial-score-meter"
      className="relative flex size-28 shrink-0 items-center justify-center"
      aria-label={`Score meter: ${clamped}%`}
    >
      <meter
        className="sr-only"
        value={clamped}
        min={0}
        max={100}
        aria-label="Score accuracy meter"
      />
      <svg
        className="size-full -rotate-90 transform"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        {/* Background track */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          className="stroke-muted/30"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress stroke */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          className={cn(
            tierStyle.meterStrokeClassName,
            "transition-[stroke-dashoffset] duration-700 ease-out"
          )}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          {clamped}
          <span className="text-xs font-normal text-muted-foreground">%</span>
        </span>
        <span className="text-[9px] font-bold tracking-widest text-muted-foreground uppercase">
          Score
        </span>
      </div>
    </div>
  )
}
