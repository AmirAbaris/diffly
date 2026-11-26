"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquareCode,
} from "lucide-react"
import {
  CoachPanel,
  type CoachPanelHandle,
} from "@/components/coach/coach-panel"
import {
  DEBRIEF_QUICK_PROMPTS,
  type CoachTarget,
} from "@/components/coach/use-coach-chat"
import { useDebriefHandoff } from "@/components/coach/use-debrief-handoff"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type {
  CoachUIMessage,
  DebriefContext,
  TargetedDrillSuggestion,
} from "@/lib/ai/coach"
import type { GradeReport } from "@/lib/review"
import { cn } from "@/lib/utils"
import { useAuthModalStore } from "@/stores/auth-modal-store"
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

const EMPTY_MESSAGES: CoachUIMessage[] = []

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
  const panelRef = React.useRef<CoachPanelHandle>(null)
  const panelId = React.useId()
  const openAuthModal = useAuthModalStore((s) => s.openAuthModal)

  const resolvedSlug = challengeSlug || solution?.slug || "challenge"

  const {
    state: handoffState,
    isSubmitting: isHandingOff,
    handoffToCoach,
    clearError: clearHandoffError,
  } = useDebriefHandoff({
    challengeSlug: resolvedSlug,
    challengeTitle,
  })

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
      <div className="flex flex-wrap items-center justify-between gap-2 pr-3">
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

        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={isHandingOff}
          onClick={() =>
            void handoffToCoach(
              panelRef.current?.getMessages() ?? EMPTY_MESSAGES,
              panelRef.current?.isStreaming() ?? false
            )
          }
          data-testid="debrief-continue-in-coach"
          className="mb-2 ml-4 shrink-0 sm:mb-0 sm:ml-0"
        >
          <span>{isHandingOff ? "Saving…" : "Continue in Coach"}</span>
          {isHandingOff ? (
            <Loader2
              data-icon="inline-end"
              aria-hidden="true"
              className="animate-spin"
            />
          ) : (
            <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
          )}
        </Button>
      </div>

      {handoffState.kind === "error" ? (
        <div
          role="alert"
          data-testid="debrief-handoff-error"
          className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <div className="flex items-center gap-2">
            <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
            <span>{handoffState.message}</span>
          </div>
          <div className="flex items-center gap-2">
            {handoffState.errorKind === "unauthenticated" ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => openAuthModal("signin")}
                data-testid="debrief-handoff-signin"
              >
                Sign In
              </Button>
            ) : null}
            {handoffState.errorKind === "quota-exceeded" ? (
              <Link
                href="/coach"
                className="font-medium underline"
                data-testid="debrief-handoff-open-coach"
              >
                Open Coach
              </Link>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={clearHandoffError}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      {hasOpened ? (
        <div
          id={panelId}
          className={cn("border-t border-border/70 p-4", !isOpen && "hidden")}
        >
          <CoachPanel
            chatId={`debrief:${resolvedSlug}`}
            target={target}
            quickPrompts={DEBRIEF_QUICK_PROMPTS}
            emptyTitle="Debrief this submission"
            emptyDescription="Ask why you missed a defect, review your flagged lines, or launch a follow-up drill."
            onGenerateDrill={onGenerateDrill}
            panelRef={panelRef}
          />
        </div>
      ) : null}
    </Card>
  )
}
