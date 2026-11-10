"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Sparkles } from "lucide-react"
import { ComparisonView } from "@/components/review/comparison-view"
import { DetectedDefectsSection } from "@/components/review/result-modal/detected-defects"
import { MissedDefectsSection } from "@/components/review/result-modal/missed-defects"
import { ModalFooterActions } from "@/components/review/result-modal/modal-footer"
import {
  getScoreTierStyle,
  parseEvaluationFeedback,
  type ScoreTierStyle,
} from "@/components/review/result-modal/score-helpers"
import { ScoreHeroSection } from "@/components/review/result-modal/score-hero"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type {
  ChallengeSolutionResponse,
  ReviewSubmissionResponse,
} from "@/types/challenge"

export { getScoreTierStyle, parseEvaluationFeedback }
export type { ScoreTierStyle }

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
  userFlaggedLines?: number[]
  userComments?: string
  codeSnippet?: string
  language?: string
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
  userFlaggedLines,
  userComments,
  codeSnippet,
  language,
}: ReviewResultModalProps) {
  const router = useRouter()
  const [showCanonicalSolution, setShowCanonicalSolution] =
    React.useState(false)

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

  const handleToggleCanonicalSolution = React.useCallback(() => {
    onViewCanonicalSolution?.()
    setShowCanonicalSolution((prev) => !prev)
  }, [onViewCanonicalSolution])

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
        className={cn(
          "max-h-[92vh] w-full overflow-x-hidden overflow-y-auto rounded-3xl border border-border/80 bg-background/95 p-6 shadow-2xl backdrop-blur-xl transition-all sm:p-7",
          showCanonicalSolution
            ? "sm:max-w-4xl lg:max-w-5xl"
            : "sm:max-w-3xl lg:max-w-4xl"
        )}
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
        <ScoreHeroSection
          score={score}
          submissionId={result.submission_id || result.id}
          tierStyle={tierStyle}
          summary={summary}
          detectedCount={detectedIssues.length}
          missedCount={missedIssues.length}
          penalty={penalty}
        />

        {/* Defect Breakdown: Detected vs Missed in 2 Balanced Columns */}
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          <DetectedDefectsSection issues={detectedIssues} />
          <MissedDefectsSection issues={missedIssues} />
        </div>

        {/* Expandable Side-by-Side Review Comparison & Canonical Solution Drawer */}
        {showCanonicalSolution && (
          <div data-testid="canonical-solution-panel" className="w-full">
            <ComparisonView
              challengeSlug={challengeSlug}
              userFlaggedLines={userFlaggedLines ?? result.flagged_lines ?? []}
              userComments={userComments ?? result.comments ?? ""}
              canonicalSolution={propSolution}
              codeSnippet={codeSnippet}
              language={language}
            />
          </div>
        )}

        {/* Action Buttons */}
        <ModalFooterActions
          showCanonicalSolution={showCanonicalSolution}
          onTryAgain={handleTryAgain}
          onToggleCanonical={handleToggleCanonicalSolution}
          onNextChallenge={handleNextChallenge}
        />
      </DialogContent>
    </Dialog>
  )
}
