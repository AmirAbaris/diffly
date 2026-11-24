"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  MessageSquareCode,
} from "lucide-react"
import { CoachPanel } from "@/components/coach/coach-panel"
import {
  DEBRIEF_QUICK_PROMPTS,
  type CoachTarget,
} from "@/components/coach/use-coach-chat"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import type { DebriefContext, TargetedDrillSuggestion } from "@/lib/ai/coach"
import type { GradeReport } from "@/lib/review"
import { cn } from "@/lib/utils"
import type {
  ChallengeFile,
  ChallengeSolutionResponse,
  FlaggedLine,
} from "@/types/challenge"

export interface DebriefCoachDrawerProps {
  challengeSlug?: string
  challengeTitle?: string
  language?: string
  codeSnippet?: string
  files?: ChallengeFile[]
  userFlaggedLines: FlaggedLine[]
  userComments: string
  gradeReport: GradeReport | null
  solution: ChallengeSolutionResponse | null
  onGenerateDrill?: (drill: TargetedDrillSuggestion) => void
}

function DebriefCoachPanelBody({
  resolvedSlug,
  target,
  onGenerateDrill,
}: {
  resolvedSlug: string
  target: CoachTarget
  onGenerateDrill?: (drill: TargetedDrillSuggestion) => void
}) {
  return (
    <CoachPanel
      chatId={`debrief:${resolvedSlug}`}
      target={target}
      quickPrompts={DEBRIEF_QUICK_PROMPTS}
      emptyTitle="Debrief this submission"
      emptyDescription="Ask why you missed a defect, review your flagged lines, or launch a follow-up drill."
      onGenerateDrill={onGenerateDrill}
    />
  )
}

export function DebriefCoachDrawer({
  challengeSlug,
  challengeTitle,
  language,
  codeSnippet,
  files,
  userFlaggedLines,
  userComments,
  gradeReport,
  solution,
  onGenerateDrill,
}: DebriefCoachDrawerProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [hasOpened, setHasOpened] = React.useState(false)
  const panelId = React.useId()

  const resolvedSlug = challengeSlug || solution?.slug || "challenge"

  const target = React.useMemo<CoachTarget>(() => {
    const context: DebriefContext = {
      challengeSlug: resolvedSlug,
      ...(challengeTitle ? { challengeTitle } : {}),
      ...(language ? { language } : {}),
      ...(codeSnippet ? { codeSnippet } : {}),
      ...(files && files.length > 0 ? { files } : {}),
      userFlaggedLines,
      userComments,
      ...(gradeReport ? { score: gradeReport.score } : {}),
      ...(gradeReport
        ? {
            detectedIssues: gradeReport.detected.map((issue) => ({
              id: issue.id,
              title: issue.title,
              severity: issue.severity,
              ...(issue.matched_lines ? { lines: issue.matched_lines } : {}),
              ...(issue.matched_keywords
                ? { keywords: issue.matched_keywords }
                : {}),
              ...(issue.explanation ? { explanation: issue.explanation } : {}),
            })),
            missedIssues: gradeReport.missed.map((issue) => ({
              id: issue.id,
              title: issue.title,
              severity: issue.severity,
              ...(issue.expected_lines ? { lines: issue.expected_lines } : {}),
              ...(issue.missing_keywords
                ? { keywords: issue.missing_keywords }
                : {}),
              ...(issue.explanation ? { explanation: issue.explanation } : {}),
            })),
          }
        : {}),
      ...(solution?.canonical_review
        ? { canonicalReview: solution.canonical_review }
        : {}),
      ...(solution?.recommended_fix_diff
        ? { recommendedFixDiff: solution.recommended_fix_diff }
        : {}),
      ...(solution?.expected_issues
        ? {
            expectedIssues: solution.expected_issues.map((issue) => ({
              id: issue.id,
              title: issue.title,
              severity: issue.severity,
              lines: issue.lines,
              keywords: issue.keywords,
              explanation: issue.explanation,
            })),
          }
        : {}),
    }

    return { mode: "debrief", context }
  }, [
    challengeTitle,
    codeSnippet,
    files,
    gradeReport,
    language,
    resolvedSlug,
    solution,
    userComments,
    userFlaggedLines,
  ])

  const handleToggle = () => {
    const next = !isOpen
    setIsOpen(next)
    if (next) {
      setHasOpened(true)
    }
  }

  return (
    <Card
      data-testid="debrief-coach-drawer"
      className="gap-0 overflow-hidden border-border/80 bg-background py-0 shadow-none"
    >
      <div className="flex items-center justify-between gap-2 pr-3">
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={isOpen}
          aria-controls={panelId}
          data-testid="debrief-coach-toggle"
          className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-foreground">
              <MessageSquareCode aria-hidden="true" className="size-3.5" />
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-foreground">
                  Debrief Tutor
                </span>
                <Badge variant="secondary" size="sm">
                  Agent Coach
                </Badge>
              </div>
              <p className="text-xs text-pretty text-muted-foreground">
                Interrogate this submission against the staff benchmark.
              </p>
            </div>
          </div>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-card text-muted-foreground">
            {isOpen ? (
              <ChevronUp aria-hidden="true" className="size-4" />
            ) : (
              <ChevronDown aria-hidden="true" className="size-4" />
            )}
          </span>
        </button>

        <Link
          href="/coach"
          data-testid="debrief-open-full-coach"
          className="hidden shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:inline-flex"
        >
          <span>Open full Coach</span>
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>

      {hasOpened ? (
        <div
          id={panelId}
          className={cn("border-t border-border/70 p-4", !isOpen && "hidden")}
        >
          <DebriefCoachPanelBody
            resolvedSlug={resolvedSlug}
            target={target}
            onGenerateDrill={onGenerateDrill}
          />
        </div>
      ) : null}
    </Card>
  )
}
