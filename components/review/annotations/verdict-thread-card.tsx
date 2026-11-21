"use client"

import * as React from "react"
import { AlertTriangle, CheckCircle2, Copy, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { Finding, FindingVerdict, VerdictMark } from "@/lib/review"
import { cn } from "@/lib/utils"
import type {
  ChallengeExpectedIssue,
  DetectedIssue,
  MissedIssue,
} from "@/types/challenge"

export interface VerdictThreadCardProps {
  mark: VerdictMark
  defect?: DetectedIssue | MissedIssue | ChallengeExpectedIssue | null
  finding?: Finding | null
  verdict?: FindingVerdict | null
}

const TONE_CONTAINER: Record<string, string> = {
  "verdict-hit": "border-emerald-500/35 bg-emerald-500/5 text-foreground",
  "verdict-miss": "border-amber-500/35 bg-amber-500/5 text-foreground",
  "verdict-false": "border-rose-500/35 bg-rose-500/5 text-foreground",
  muted: "border-border bg-muted/40 text-foreground",
}

const TONE_BADGE_VARIANT: Record<
  string,
  "success" | "warning" | "destructive" | "secondary"
> = {
  "verdict-hit": "success",
  "verdict-miss": "warning",
  "verdict-false": "destructive",
  muted: "secondary",
}

const TONE_HEADING: Record<string, string> = {
  "verdict-hit": "Matched",
  "verdict-miss": "Missed",
  "verdict-false": "False positive",
  muted: "Redundant",
}

function ToneIcon({ tone }: { tone: string }) {
  if (tone === "verdict-hit") {
    return (
      <CheckCircle2
        aria-hidden="true"
        className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
      />
    )
  }
  if (tone === "verdict-miss") {
    return (
      <AlertTriangle
        aria-hidden="true"
        className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
      />
    )
  }
  if (tone === "verdict-false") {
    return (
      <XCircle
        aria-hidden="true"
        className="size-3.5 shrink-0 text-rose-600 dark:text-rose-400"
      />
    )
  }
  return (
    <Copy
      aria-hidden="true"
      className="size-3.5 shrink-0 text-muted-foreground"
    />
  )
}

function VerdictSeverityBadges({
  severity,
  severityAgrees,
}: {
  severity?: string
  severityAgrees?: boolean | null
}) {
  return (
    <div className="flex items-center gap-1.5">
      {severity && (
        <Badge variant="outline" size="sm" className="uppercase">
          {severity}
        </Badge>
      )}
      {severityAgrees !== null && severityAgrees !== undefined && (
        <Badge variant={severityAgrees ? "success" : "outline"} size="sm">
          {severityAgrees ? "Severity matched" : "Severity mismatch"}
        </Badge>
      )}
    </div>
  )
}

export function VerdictThreadCard({
  mark,
  defect,
  finding,
  verdict,
}: VerdictThreadCardProps) {
  const title = defect?.title ?? mark.label
  const explanation =
    defect && "explanation" in defect ? defect.explanation : undefined
  const heading = TONE_HEADING[mark.tone] ?? mark.label

  return (
    <div
      data-testid={`verdict-thread-${mark.tone}-${mark.start}`}
      className={cn(
        "my-1.5 flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 font-sans text-xs",
        TONE_CONTAINER[mark.tone] ?? TONE_CONTAINER.muted
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <ToneIcon tone={mark.tone} />
          <Badge
            variant={TONE_BADGE_VARIANT[mark.tone] ?? "secondary"}
            size="sm"
          >
            {heading}
          </Badge>
          {title && title !== heading && (
            <span className="font-semibold text-foreground">{title}</span>
          )}
        </div>

        <VerdictSeverityBadges
          severity={defect?.severity}
          severityAgrees={verdict?.severityAgrees}
        />
      </div>

      {explanation && (
        <p className="leading-relaxed text-pretty text-muted-foreground">
          {explanation}
        </p>
      )}

      {finding?.body && (
        <div className="rounded-md border border-border/60 bg-background/60 px-2.5 py-1.5 text-foreground">
          <span className="font-medium text-muted-foreground">Your note: </span>
          <span>{finding.body}</span>
        </div>
      )}
    </div>
  )
}
