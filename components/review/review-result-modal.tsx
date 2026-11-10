"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCode,
  Loader2,
  RotateCcw,
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
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  badgeClassName: string
  meterStrokeClassName: string
  ringClassName: string
  summaryBgClassName: string
}

function getScoreTierStyle(score: number): ScoreTierStyle {
  if (score >= 80) {
    return {
      label: "Outstanding Reviewer",
      badgeVariant: "outline",
      badgeClassName:
        "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold",
      meterStrokeClassName: "stroke-emerald-500",
      ringClassName: "text-emerald-500",
      summaryBgClassName:
        "border-emerald-500/20 bg-emerald-500/5 text-emerald-950 dark:text-emerald-200",
    }
  }

  if (score >= 50) {
    return {
      label: "Partially identified",
      badgeVariant: "outline",
      badgeClassName:
        "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold",
      meterStrokeClassName: "stroke-amber-500",
      ringClassName: "text-amber-500",
      summaryBgClassName:
        "border-amber-500/20 bg-amber-500/5 text-amber-950 dark:text-amber-200",
    }
  }

  return {
    label: "Vulnerabilities missed",
    badgeVariant: "outline",
    badgeClassName:
      "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 font-semibold",
    meterStrokeClassName: "stroke-rose-500",
    ringClassName: "text-rose-500",
    summaryBgClassName:
      "border-rose-500/20 bg-rose-500/5 text-rose-950 dark:text-rose-200",
  }
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
  const radius = 46
  const strokeWidth = 8
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (clamped / 100) * circumference
  const tierStyle = getScoreTierStyle(clamped)

  return (
    <div
      data-testid="radial-score-meter"
      className="relative flex size-32 shrink-0 items-center justify-center"
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
        viewBox="0 0 110 110"
        aria-hidden="true"
      >
        {/* Background track */}
        <circle
          cx="55"
          cy="55"
          r={radius}
          className="stroke-muted/40"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress stroke */}
        <circle
          cx="55"
          cy="55"
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
        <span className="font-heading text-3xl font-extrabold tracking-tight text-foreground">
          {clamped}
          <span className="text-base font-normal text-muted-foreground">%</span>
        </span>
        <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Accuracy
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
      className="flex flex-col gap-2.5 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 dark:border-emerald-500/20 dark:bg-emerald-950/15"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          <h4 className="text-xs font-semibold tracking-wider text-emerald-950 uppercase dark:text-emerald-200">
            Detected Defects
          </h4>
        </div>
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
          {issues.length} {issues.length === 1 ? "issue" : "issues"}
        </span>
      </div>

      {!hasIssues ? (
        <div className="rounded-xl border border-dashed border-emerald-500/20 bg-background/60 p-3 text-xs text-muted-foreground">
          No vulnerabilities were matched in this attempt. Flag the affected
          code lines and describe the defect to earn detection credit.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
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
                className="flex flex-col gap-1.5 rounded-xl border border-emerald-500/20 bg-card p-3 shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-semibold text-foreground">
                      {issue.title || issue.id}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {matchedLinesStr && (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        Line
                        {issue.matched_lines && issue.matched_lines.length > 1
                          ? "s"
                          : ""}{" "}
                        {matchedLinesStr}
                      </span>
                    )}
                    <SeverityBadge severity={issue.severity || "medium"} />
                  </div>
                </div>

                {issue.explanation && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {issue.explanation}
                  </p>
                )}

                {issue.matched_keywords &&
                  issue.matched_keywords.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        Matched concepts:
                      </span>
                      {issue.matched_keywords.map((kw) => (
                        <span
                          key={kw}
                          className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
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
      className="flex flex-col gap-2.5 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 dark:border-amber-500/20 dark:bg-amber-950/15"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
          <h4 className="text-xs font-semibold tracking-wider text-amber-950 uppercase dark:text-amber-200">
            Missed Defects
          </h4>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-bold",
            hasMissed
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
              : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          )}
        >
          {issues.length} {issues.length === 1 ? "issue" : "issues"}
        </span>
      </div>

      {!hasMissed ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            Excellent! You caught all expected vulnerabilities in this
            challenge.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
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
                className="flex flex-col gap-1.5 rounded-xl border border-amber-500/20 bg-card p-3 shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="text-xs font-semibold text-foreground">
                      {issue.title || issue.id}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {expectedLinesStr && (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        Expected line
                        {issue.expected_lines && issue.expected_lines.length > 1
                          ? "s"
                          : ""}{" "}
                        {expectedLinesStr}
                      </span>
                    )}
                    <SeverityBadge severity={issue.severity || "medium"} />
                  </div>
                </div>

                {issue.explanation && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      Hint:{" "}
                    </span>
                    {issue.explanation}
                  </p>
                )}

                {issue.missing_keywords &&
                  issue.missing_keywords.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        Keywords to mention:
                      </span>
                      {issue.missing_keywords.map((kw) => (
                        <span
                          key={kw}
                          className="rounded border border-border/60 bg-muted/50 px-1 py-0.5 font-mono text-[10px] text-muted-foreground"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
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
        <Loader2 className="size-4 animate-spin" />
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
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-xs"
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
          <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs leading-relaxed text-foreground">
            <MarkdownPreview content={solution.canonical_review} />
          </div>
        </div>
      )}

      {solution.recommended_fix_diff && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            Recommended Fix Diff
          </span>
          <pre className="overflow-x-auto rounded-xl border border-border bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100">
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
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl p-6 sm:p-7"
      >
        <DialogHeader className="gap-1.5 pb-2 text-left">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <DialogTitle className="text-xl font-bold tracking-tight">
              Evaluation Results
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {challengeTitle
              ? `Review assessment for ${challengeTitle}`
              : "Review assessment and vulnerability breakdown"}
          </DialogDescription>
        </DialogHeader>

        {/* Hero Section: Circular Meter & Tier Badge */}
        <div
          data-testid="score-hero-container"
          className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card/60 p-5 backdrop-blur-xs sm:flex-row sm:items-center sm:gap-6"
        >
          <RadialScoreMeter score={score} />

          <div className="flex flex-1 flex-col items-center gap-2 text-center sm:items-start sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <Badge
                variant={tierStyle.badgeVariant}
                className={cn("px-3 py-1 text-xs", tierStyle.badgeClassName)}
              >
                {tierStyle.label}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">
                Submission #{result.submission_id || result.id}
              </span>
            </div>

            {result.feedback ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {result.feedback}
              </p>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Evaluation engine compared your flagged lines and comments
                against known vulnerability locations and criteria.
              </p>
            )}
          </div>
        </div>

        {/* Defect Breakdown: Detected vs Missed */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <DialogFooter className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
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
