"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCode,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
} from "lucide-react"
import { MarkdownPreview } from "@/components/review/markdown-preview"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { apiClient } from "@/lib/axios"
import { cn } from "@/lib/utils"
import type {
  ChallengeSolutionResponse,
  DetectedIssue,
  MissedIssue,
  ReviewSubmissionResponse,
} from "@/types/challenge"

export interface ReviewResultModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: ReviewSubmissionResponse | null
  challengeSlug: string
  challengeTitle?: string
  nextChallengeSlug?: string | null
  onTryAgain?: () => void
  onViewCanonicalSolution?: () => void
  onNextChallenge?: () => void
  canonicalSolution?: ChallengeSolutionResponse | null
}

interface ScoreTierStyle {
  label: string
  badgeClassName: string
  meterStrokeClassName: string
  dotClassName: string
}

function getScoreTierStyle(score: number): ScoreTierStyle {
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

function parseEvaluationFeedback(rawFeedback?: string) {
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

function FormattedInlineText({ text }: { text: string }) {
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

function SeverityBadge({ severity }: { severity: string }) {
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

function RadialScoreMeter({ score }: { score: number }) {
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

function DetectedDefectsSection({ issues }: { issues: DetectedIssue[] }) {
  const hasIssues = issues.length > 0

  return (
    <div
      data-testid="detected-defects-section"
      className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card/60 p-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          <h4 className="text-xs font-semibold tracking-wide text-foreground">
            Detected Defects
          </h4>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
          {issues.length} {issues.length === 1 ? "issue" : "issues"}
        </span>
      </div>

      {!hasIssues ? (
        <div className="flex flex-col gap-1 rounded-xl border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            No vulnerabilities matched
          </span>
          <p className="leading-relaxed">
            Review the code snippet to identify defect locations and explain
            root causes to earn detection credit.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {issues.map((issue) => {
            const matchedLinesStr =
              issue.matched_lines && issue.matched_lines.length > 0
                ? issue.matched_lines.join(", ")
                : null
            const issueKey = issue.id || issue.title || "detected-issue"

            return (
              <div
                key={issueKey}
                data-testid={`detected-issue-${issue.id || issue.title || "defect"}`}
                className="flex flex-col gap-2 rounded-xl border border-emerald-500/20 bg-background/80 p-3.5 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs leading-snug font-semibold break-words text-foreground">
                      {issue.title || issue.id}
                    </span>
                  </div>
                  <SeverityBadge severity={issue.severity || "medium"} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {matchedLinesStr && (
                    <span className="rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      Line
                      {issue.matched_lines && issue.matched_lines.length > 1
                        ? "s"
                        : ""}
                      : {matchedLinesStr}
                    </span>
                  )}
                  {issue.matched_keywords &&
                    issue.matched_keywords.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">
                          Matched:
                        </span>
                        {issue.matched_keywords.map((kw) => (
                          <span
                            key={kw}
                            className="py-0.2 rounded border border-border/70 bg-muted/50 px-1 font-mono text-[10px] text-foreground"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                </div>

                {issue.explanation && (
                  <p className="border-t border-border/50 pt-2 text-xs leading-relaxed text-muted-foreground">
                    <FormattedInlineText text={issue.explanation} />
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MissedDefectsSection({ issues }: { issues: MissedIssue[] }) {
  const hasMissed = issues.length > 0

  return (
    <div
      data-testid="missed-defects-section"
      className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card/60 p-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
          <h4 className="text-xs font-semibold tracking-wide text-foreground">
            Missed Defects
          </h4>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold",
            hasMissed
              ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
              : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          )}
        >
          {issues.length} {issues.length === 1 ? "issue" : "issues"}
        </span>
      </div>

      {!hasMissed ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-emerald-950 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-emerald-800 dark:text-emerald-300">
              All vulnerabilities identified
            </span>
            <p className="leading-relaxed text-muted-foreground">
              You correctly flagged all expected defect lines and concepts for
              this challenge.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {issues.map((issue) => {
            const expectedLinesStr =
              issue.expected_lines && issue.expected_lines.length > 0
                ? issue.expected_lines.join(", ")
                : null
            const issueKey = issue.id || issue.title || "missed-issue"

            return (
              <div
                key={issueKey}
                data-testid={`missed-issue-${issue.id || issue.title || "defect"}`}
                className="flex flex-col gap-2 rounded-xl border border-amber-500/25 bg-background/80 p-3.5 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="text-xs leading-snug font-semibold break-words text-foreground">
                      {issue.title || issue.id}
                    </span>
                  </div>
                  <SeverityBadge severity={issue.severity || "medium"} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {expectedLinesStr && (
                    <span className="rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      Expected line
                      {issue.expected_lines && issue.expected_lines.length > 1
                        ? "s"
                        : ""}
                      : {expectedLinesStr}
                    </span>
                  )}
                  {issue.missing_keywords &&
                    issue.missing_keywords.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">
                          Overlooked concepts:
                        </span>
                        {issue.missing_keywords.map((kw) => (
                          <span
                            key={kw}
                            className="py-0.2 rounded border border-border/70 bg-muted/50 px-1 font-mono text-[10px] text-muted-foreground"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                </div>

                {issue.explanation && (
                  <p className="border-t border-border/50 pt-2 text-xs leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      Hint:{" "}
                    </span>
                    <FormattedInlineText text={issue.explanation} />
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CanonicalSolutionPanel({
  solution,
  isLoading,
}: {
  solution: ChallengeSolutionResponse | null
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-muted/30 p-8 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span>Loading canonical solution...</span>
      </div>
    )
  }

  if (!solution) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
        Canonical solution could not be retrieved at this time.
      </div>
    )
  }

  return (
    <div
      data-testid="canonical-solution-panel"
      className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-4 shadow-xs sm:p-5"
    >
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <FileCode className="size-4 text-primary" />
        <h4 className="text-sm font-semibold text-foreground">
          Canonical Solution & Recommended Fix
        </h4>
      </div>

      {solution.canonical_review && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            Canonical Review Critique
          </span>
          <div className="rounded-xl border border-border bg-muted/20 p-3.5 text-xs leading-relaxed text-foreground">
            <MarkdownPreview content={solution.canonical_review} />
          </div>
        </div>
      )}

      {solution.recommended_fix_diff && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            Recommended Fix Diff
          </span>
          <pre className="overflow-x-auto rounded-xl border border-border bg-zinc-950 p-3.5 font-mono text-[11px] leading-relaxed text-zinc-100">
            <code>{solution.recommended_fix_diff}</code>
          </pre>
        </div>
      )}
    </div>
  )
}

export function ReviewResultModal({
  open,
  onOpenChange,
  result,
  challengeSlug,
  challengeTitle,
  nextChallengeSlug,
  onTryAgain,
  onViewCanonicalSolution,
  onNextChallenge,
  canonicalSolution: propSolution,
}: ReviewResultModalProps) {
  const router = useRouter()
  const [showCanonicalSolution, setShowCanonicalSolution] =
    React.useState(false)
  const [fetchedSolution, setFetchedSolution] =
    React.useState<ChallengeSolutionResponse | null>(null)
  const [isSolutionLoading, setIsSolutionLoading] = React.useState(false)

  const solutionData = propSolution ?? fetchedSolution

  const score = result?.score ?? 0
  const tierStyle = getScoreTierStyle(score)
  const detectedIssues = result?.detected_issues ?? []
  const missedIssues = result?.missed_issues ?? []

  const { summary, penalty } = React.useMemo(() => {
    return parseEvaluationFeedback(result?.feedback)
  }, [result?.feedback])

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setShowCanonicalSolution(false)
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange]
  )

  const handleTryAgain = React.useCallback(() => {
    setShowCanonicalSolution(false)
    onOpenChange(false)
    onTryAgain?.()
  }, [onOpenChange, onTryAgain])

  const handleToggleCanonicalSolution = React.useCallback(async () => {
    onViewCanonicalSolution?.()

    const willShow = !showCanonicalSolution
    setShowCanonicalSolution(willShow)

    if (willShow && !solutionData && !isSolutionLoading) {
      setIsSolutionLoading(true)
      try {
        const response = await apiClient.get<ChallengeSolutionResponse>(
          `/api/challenges/${challengeSlug}/solution?reveal=true`
        )
        setFetchedSolution(response.data)
      } catch {
        // Handled gracefully in canonical solution panel
      } finally {
        setIsSolutionLoading(false)
      }
    }
  }, [
    showCanonicalSolution,
    solutionData,
    isSolutionLoading,
    challengeSlug,
    onViewCanonicalSolution,
  ])

  const handleNextChallenge = React.useCallback(() => {
    setShowCanonicalSolution(false)
    onOpenChange(false)
    if (onNextChallenge) {
      onNextChallenge()
    } else if (nextChallengeSlug) {
      router.push(`/challenges/${nextChallengeSlug}`)
    } else {
      router.push("/challenges")
    }
  }, [onOpenChange, onNextChallenge, nextChallengeSlug, router])

  if (!result) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="review-result-modal"
        className="max-h-[92vh] w-full overflow-x-hidden overflow-y-auto rounded-3xl border border-border/80 bg-background/95 p-6 shadow-2xl backdrop-blur-xl sm:max-w-3xl sm:p-7 lg:max-w-4xl"
      >
        <DialogHeader className="gap-1 pb-1 text-left">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <DialogTitle className="text-lg font-bold tracking-tight sm:text-xl">
              Evaluation Results
            </DialogTitle>
          </div>
          <DialogDescription className="max-w-xl truncate text-xs text-muted-foreground">
            {challengeTitle
              ? `Assessment for ${challengeTitle}`
              : "Review assessment and vulnerability breakdown"}
          </DialogDescription>
        </DialogHeader>

        {/* Hero Section: Gauge & Executive Summary */}
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
                  className={cn(
                    "size-1.5 rounded-full",
                    tierStyle.dotClassName
                  )}
                />
                <span>{tierStyle.label}</span>
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">
                Submission #{result.submission_id || result.id}
              </span>
            </div>

            <p className="text-xs leading-relaxed font-medium text-foreground/90">
              {summary}
            </p>

            {/* Quick Metrics Bar */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5 sm:justify-start">
              <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                <Check className="size-3 text-emerald-500" />
                <span>{detectedIssues.length} detected</span>
              </span>

              <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                <AlertTriangle className="size-3 text-amber-500" />
                <span>{missedIssues.length} missed</span>
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

        {/* Defect Breakdown: Detected vs Missed in 2 Balanced Columns */}
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          <DetectedDefectsSection issues={detectedIssues} />
          <MissedDefectsSection issues={missedIssues} />
        </div>

        {/* Expandable Canonical Solution Drawer */}
        {showCanonicalSolution && (
          <CanonicalSolutionPanel
            solution={solutionData}
            isLoading={isSolutionLoading}
          />
        )}

        {/* Action Buttons */}
        <DialogFooter className="flex flex-col-reverse gap-2.5 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={handleTryAgain}
            className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            data-testid="try-again-button"
          >
            <RotateCcw className="size-3.5" />
            <span>Try Again</span>
          </Button>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="outline"
              onClick={handleToggleCanonicalSolution}
              className="h-9 gap-1.5 text-xs"
              data-testid="view-canonical-solution-button"
            >
              <FileCode className="size-3.5" />
              <span>
                {showCanonicalSolution
                  ? "Hide Canonical Solution"
                  : "View Canonical Solution"}
              </span>
              {showCanonicalSolution ? (
                <ChevronUp className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
            </Button>

            <Button
              type="button"
              onClick={handleNextChallenge}
              className="h-9 gap-1.5 text-xs font-semibold"
              data-testid="next-challenge-button"
            >
              <span>Next Challenge</span>
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
