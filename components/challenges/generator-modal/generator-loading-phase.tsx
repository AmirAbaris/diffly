"use client"

import * as React from "react"

const GENERATION_PHASES = [
  "Connecting to Gemini API…",
  "Analyzing threat model & security boundaries…",
  "Writing defective snippet with realistic logic…",
  "Verifying line targets & reference critique…",
  "Finalizing challenge setup & persisting…",
] as const

export function GeneratorLoadingPhase() {
  const [phaseIndex, setPhaseIndex] = React.useState(0)

  React.useEffect(() => {
    const timer = setInterval(() => {
      setPhaseIndex((prev) => Math.min(prev + 1, GENERATION_PHASES.length - 1))
    }, 2800)
    return () => clearInterval(timer)
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="generator-loading-phase"
      className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-foreground"
        />
        <span className="truncate font-mono">
          {GENERATION_PHASES[phaseIndex]}
        </span>
      </div>
      <span className="shrink-0 font-mono tabular-nums">
        Step {phaseIndex + 1}/{GENERATION_PHASES.length}
      </span>
    </div>
  )
}
