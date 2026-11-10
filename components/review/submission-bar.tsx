"use client"

import * as React from "react"
import {
  CheckCircle2,
  Flag,
  History,
  Loader2,
  RotateCcw,
  Send,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useReviewDraft } from "@/hooks/use-review-draft"
import { toast } from "@/hooks/use-toast"
import { useArenaUIStore } from "@/stores/arena-ui-store"
import { apiClient } from "@/lib/axios"
import { cn } from "@/lib/utils"
import type { ReviewSubmissionResponse } from "@/types/challenge"

export interface SubmissionBarProps {
  challengeSlug: string
  challengeId?: number | string
  flaggedLines?: number[]
  comments?: string
  onResetDraft?: () => void
  onSubmitReview?: () => Promise<void> | void
  onSubmitSuccess?: (result: ReviewSubmissionResponse) => void
  onSubmitError?: (error: unknown) => void
  onViewResults?: () => void
  onOpenHistory?: () => void
  attemptCount?: number
  hasSubmitted?: boolean
  isSubmitting?: boolean
  className?: string
}

function getSubmissionTooltip(
  isSubmitting: boolean,
  hasLines: boolean,
  hasComment: boolean
): string {
  if (isSubmitting) {
    return "Submitting your review..."
  }
  if (!hasLines && !hasComment) {
    return "Flag at least one line and write a review comment to submit"
  }
  if (!hasLines) {
    return "Flag at least one line in the code viewer to submit"
  }
  if (!hasComment) {
    return "Write a review comment explaining the defect to submit"
  }
  return "Submit your review for automated scoring"
}

function formatDraftSummary(lineCount: number, charCount: number): string {
  const lineSummary =
    lineCount === 1 ? "1 line flagged" : `${lineCount} lines flagged`
  const charSummary = `${charCount} ${charCount === 1 ? "char" : "chars"} written`
  return `${lineSummary} • ${charSummary}`
}

interface SubmitButtonProps {
  isSubmitting: boolean
  isSubmitDisabled: boolean
  tooltipMessage: string
  onSubmit: () => void
}

function SubmitButton({
  isSubmitting,
  isSubmitDisabled,
  tooltipMessage,
  onSubmit,
}: SubmitButtonProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              type="button"
              size="sm"
              disabled={isSubmitDisabled}
              onClick={onSubmit}
              className="h-8 gap-1.5 px-3.5 text-xs font-semibold sm:h-9 sm:px-4 sm:text-xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send className="size-3.5" />
                  <span>Submit Review</span>
                </>
              )}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="end">
          {tooltipMessage}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function SubmissionBar({
  challengeSlug,
  challengeId,
  flaggedLines: propFlaggedLines,
  comments: propComments,
  onResetDraft: propOnResetDraft,
  onSubmitReview: propOnSubmitReview,
  onSubmitSuccess,
  onSubmitError,
  onViewResults,
  onOpenHistory,
  attemptCount,
  hasSubmitted,
  isSubmitting: propIsSubmitting,
  className,
}: SubmissionBarProps) {
  const draft = useReviewDraft(
    propFlaggedLines === undefined || propComments === undefined
      ? challengeSlug
      : ""
  )

  const flaggedLines = propFlaggedLines ?? draft.flaggedLines
  const comments = propComments ?? draft.comments

  const storeSetIsResultModalOpen = useArenaUIStore(
    (s) => s.setIsResultModalOpen
  )
  const storeSetIsHistoryOpen = useArenaUIStore((s) => s.setIsHistoryOpen)

  const handleOpenHistory = onOpenHistory ?? (() => storeSetIsHistoryOpen(true))
  const handleViewResults =
    onViewResults ?? (() => storeSetIsResultModalOpen(true))

  const [internalIsSubmitting, setInternalIsSubmitting] = React.useState(false)
  const isSubmitting = propIsSubmitting ?? internalIsSubmitting

  const lineCount = flaggedLines.length
  const charCount = comments.length
  const summaryCount = formatDraftSummary(lineCount, charCount)

  const hasLines = lineCount > 0
  const hasComment = comments.trim().length > 0
  const isSubmitDisabled = !hasLines || !hasComment || isSubmitting
  const tooltipMessage = getSubmissionTooltip(
    isSubmitting,
    hasLines,
    hasComment
  )

  const handleResetDraft = React.useCallback(() => {
    if (propOnResetDraft) {
      propOnResetDraft()
    } else {
      draft.resetDraft()
    }
    toast({
      title: "Draft reset",
      description: "Your review draft has been cleared.",
    })
  }, [propOnResetDraft, draft])

  const handleSubmit = React.useCallback(async () => {
    if (isSubmitDisabled) return

    if (propOnSubmitReview) {
      await propOnSubmitReview()
      return
    }

    setInternalIsSubmitting(true)
    const targetIdentifier = challengeId ?? challengeSlug

    try {
      const response = await apiClient.post<ReviewSubmissionResponse>(
        `/api/challenges/${targetIdentifier}/review`,
        {
          flagged_lines: flaggedLines,
          comments: comments.trim(),
        }
      )

      toast({
        title: "Review submitted successfully",
        description: `Score: ${response.data.score}% • Review breakdown loaded.`,
        variant: "success",
      })

      onSubmitSuccess?.(response.data)

      if (propOnResetDraft) {
        propOnResetDraft()
      } else {
        draft.resetDraft()
      }
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ||
        (err instanceof Error ? err.message : "Failed to submit review")

      toast({
        title: "Submission failed",
        description: errorMsg,
        variant: "destructive",
      })

      onSubmitError?.(err)
    } finally {
      setInternalIsSubmitting(false)
    }
  }, [
    isSubmitDisabled,
    propOnSubmitReview,
    challengeId,
    challengeSlug,
    flaggedLines,
    comments,
    onSubmitSuccess,
    onSubmitError,
    propOnResetDraft,
    draft,
  ])

  return (
    <div
      data-testid="submission-bar"
      className={cn(
        "sticky bottom-0 z-20 flex w-full shrink-0 items-center justify-between border-t border-border bg-card/95 px-4 py-2.5 backdrop-blur-md sm:px-6",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
          <Flag className="size-3.5 text-amber-500" />
          <span className="font-mono font-medium text-foreground">
            {summaryCount}
          </span>
        </div>

        {hasLines && hasComment && (
          <span className="hidden items-center gap-1 text-[11px] font-medium text-emerald-600 sm:inline-flex dark:text-emerald-400">
            <CheckCircle2 className="size-3" />
            <span>Ready to submit</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleResetDraft}
          disabled={lineCount === 0 && charCount === 0 && !isSubmitting}
          className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground sm:h-9 sm:px-3 sm:text-xs"
        >
          <RotateCcw className="size-3" />
          <span>Reset Draft</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleOpenHistory}
          className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground sm:h-9 sm:px-3"
          data-testid="submission-bar-history-button"
          aria-label="View past attempts"
        >
          <History className="size-3.5" />
          <span className="hidden sm:inline">History</span>
          {attemptCount !== undefined && attemptCount > 0 && (
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-bold">
              {attemptCount}
            </span>
          )}
        </Button>

        <SubmitButton
          isSubmitting={isSubmitting}
          isSubmitDisabled={isSubmitDisabled}
          tooltipMessage={tooltipMessage}
          onSubmit={handleSubmit}
        />

        {hasSubmitted && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleViewResults}
            className="h-8 gap-1.5 px-3 text-xs font-semibold sm:h-9"
            data-testid="reopen-comparison-button"
          >
            <span>Compare Solution</span>
          </Button>
        )}
      </div>
    </div>
  )
}
