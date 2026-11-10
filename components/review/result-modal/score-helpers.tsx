import * as React from "react"
import { Badge } from "@/components/ui/badge"

export interface ScoreTierStyle {
  label: string
  badgeClassName: string
  meterStrokeClassName: string
  dotClassName: string
}

export function getScoreTierStyle(score: number): ScoreTierStyle {
  if (score >= 80) {
    return {
      label: "Outstanding Reviewer",
      badgeClassName:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      meterStrokeClassName: "stroke-emerald-500",
      dotClassName: "bg-emerald-500",
    }
  }

  if (score >= 50) {
    return {
      label: "Partially identified",
      badgeClassName:
        "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      meterStrokeClassName: "stroke-amber-500",
      dotClassName: "bg-amber-500",
    }
  }

  return {
    label: "Vulnerabilities missed",
    badgeClassName:
      "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
    meterStrokeClassName: "stroke-rose-500",
    dotClassName: "bg-rose-500",
  }
}

export function parseEvaluationFeedback(rawFeedback?: string) {
  if (!rawFeedback) {
    return {
      summary:
        "Evaluation engine evaluated your flagged lines and comments against expected defects.",
      penalty: null,
    }
  }

  const lines = rawFeedback
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return {
      summary:
        "Evaluation engine evaluated your flagged lines and comments against expected defects.",
      penalty: null,
    }
  }

  const summary = lines[0]
  let penalty: string | null = null

  for (const line of lines.slice(1)) {
    if (line.toLowerCase().startsWith("penalty applied:")) {
      penalty = line.replace(/^penalty applied:\s*/i, "")
      break
    }
  }

  return { summary, penalty }
}

export function FormattedInlineText({ text }: { text: string }) {
  const segments = React.useMemo(() => {
    return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean)
  }, [text])

  return (
    <>
      {segments.map((segment) => {
        if (segment.startsWith("`") && segment.endsWith("`")) {
          return (
            <code
              key={segment}
              className="rounded border border-border/60 bg-muted/70 px-1 py-0.5 font-mono text-[11px] text-foreground"
            >
              {segment.slice(1, -1)}
            </code>
          )
        }

        if (segment.startsWith("**") && segment.endsWith("**")) {
          return (
            <strong key={segment} className="font-semibold text-foreground">
              {segment.slice(2, -2)}
            </strong>
          )
        }

        return <span key={segment}>{segment}</span>
      })}
    </>
  )
}

export function SeverityBadge({ severity }: { severity: string }) {
  const norm = severity.toLowerCase()
  if (norm === "critical" || norm === "high") {
    return (
      <Badge
        variant="destructive"
        className="px-1.5 py-0 text-[10px] font-bold tracking-wider uppercase"
      >
        {severity}
      </Badge>
    )
  }

  if (norm === "medium") {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[10px] font-bold tracking-wider text-amber-700 uppercase dark:text-amber-300"
      >
        {severity}
      </Badge>
    )
  }

  return (
    <Badge
      variant="secondary"
      className="px-1.5 py-0 text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
    >
      {severity}
    </Badge>
  )
}
