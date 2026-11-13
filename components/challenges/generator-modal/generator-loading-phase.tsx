"use client"

import * as React from "react"
import { Loader2, Sparkles } from "lucide-react"

const GENERATION_PHASES = [
  "Connecting to Gemini API...",
  "Analyzing threat model & security boundaries...",
  "Writing defective snippet with realistic logic...",
  "Verifying line targets & reference critique...",
  "Finalizing challenge setup & persisting...",
]

export interface GeneratorLoadingPhaseProps {
  topic: string
}

export function GeneratorLoadingPhase({ topic }: GeneratorLoadingPhaseProps) {
  const [phaseIndex, setPhaseIndex] = React.useState(0)

  React.useEffect(() => {
    const timer = setInterval(() => {
      setPhaseIndex((prev) => (prev + 1) % GENERATION_PHASES.length)
    }, 2800)
    return () => clearInterval(timer)
  }, [])

  return (
    <div
      data-testid="generator-loading-phase"
      className="flex flex-col items-center justify-center gap-6 py-10 text-center"
    >
      <div className="relative flex items-center justify-center">
        <div className="size-16 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
        <Sparkles
          aria-hidden="true"
          className="absolute size-6 animate-pulse text-primary"
        />
      </div>

      <div className="flex max-w-sm flex-col gap-2">
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          Generating Custom Challenge
        </h3>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          &ldquo;{topic}&rdquo;
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-border/80 bg-muted/60 px-4 py-1.5 text-xs text-muted-foreground">
        <Loader2
          aria-hidden="true"
          className="size-3.5 animate-spin text-primary"
        />
        <span aria-live="polite" className="font-mono">
          {GENERATION_PHASES[phaseIndex]}
        </span>
      </div>
    </div>
  )
}
