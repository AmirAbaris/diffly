"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { toast } from "@/hooks/use-toast"
import {
  MIN_REVIEW_COMMENT_CHARS,
  validateReviewSubmission,
} from "@/lib/review-validation"
import { cn } from "@/lib/utils"

export interface SubmissionBarProps {
  flaggedLines: number[]
  comments: string
  onResetDraft: () => void
  onOpenFlagGuide: () => void
  onSubmitReview: () => Promise<unknown> | void
  onViewResults: () => void
  onOpenHistory: () => void
  attemptCount: number
  hasSubmitted: boolean
  isSubmitting: boolean
  className?: string
}

function getSubmissionTooltip(
  isSubmitting: boolean,
  hasLines: boolean,
  hasMinComment: boolean,
  remainingChars: number
): string {
  if (isSubmitting) {
    return "Submitting your review…"
  }
  if (!hasLines && !hasMinComment) {
    return `Flag at least one line and write at least ${MIN_REVIEW_COMMENT_CHARS} characters to submit`
  }
  if (!hasLines) {
    return "Flag at least one line in the code viewer to submit"
  }
  if (!hasMinComment) {
    return `Write at least ${MIN_REVIEW_COMMENT_CHARS} characters explaining the defect (${remainingChars} more needed)`
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
              className="h-8 gap-1.5 px-3.5 text-xs font-medium sm:h-9 sm:px-4"
            >
              {isSubmitting ? (
                <>
                  <Loader2
                    aria-hidden="true"
                    className="size-3.5 animate-spin"
                  />
                  <span>Submitting…</span>
                </>
              ) : (
                <span>Submit Review</span>
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
  flaggedLines,
  comments,
  onResetDraft,
  onOpenFlagGuide,
  onSubmitReview,
  onViewResults,
  onOpenHistory,
  attemptCount,
  hasSubmitted,
  isSubmitting,
  className,
}: SubmissionBarProps) {
  const lineCount = flaggedLines.length
  const charCount = comments.length
  const summaryCount = formatDraftSummary(lineCount, charCount)

  const validation = validateReviewSubmission(flaggedLines, comments)
  const { hasLines, hasMinComment, remainingChars, canSubmit } = validation
  const isSubmitDisabled = !canSubmit || isSubmitting
  const tooltipMessage = getSubmissionTooltip(
    isSubmitting,
    hasLines,
    hasMinComment,
    remainingChars
  )

  const handleResetDraft = React.useCallback(() => {
    onResetDraft()
    toast({
      title: "Draft reset",
      description: "Your review draft has been cleared.",
    })
  }, [onResetDraft])

  const handleSubmit = React.useCallback(async () => {
    if (isSubmitDisabled) return
    await onSubmitReview()
  }, [isSubmitDisabled, onSubmitReview])

  return (
    <div
      data-testid="submission-bar"
      className={cn(
        "sticky bottom-0 z-20 flex w-full shrink-0 flex-col gap-2 border-t border-border bg-card/95 px-4 py-2.5 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-6",
        className
      )}
    >
      <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start sm:gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
          <span className="font-mono text-xs font-medium whitespace-nowrap text-foreground tabular-nums">
            {summaryCount}
          </span>
        </div>

        {!hasLines && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onOpenFlagGuide}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            data-testid="submission-bar-guide-button"
          >
            <span>How to flag</span>
          </Button>
        )}

        {canSubmit && (
          <Badge variant="success" size="sm" className="hidden sm:inline-flex">
            Ready to submit
          </Badge>
        )}
      </div>

      <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleResetDraft}
          disabled={lineCount === 0 && charCount === 0 && !isSubmitting}
          className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground sm:h-9 sm:px-3"
        >
          <span>Reset Draft</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onOpenHistory}
          className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground sm:h-9 sm:px-3"
          data-testid="submission-bar-history-button"
          aria-label="View past attempts"
        >
          <span>History</span>
          {attemptCount > 0 && (
            <Badge variant="secondary" size="sm" className="tabular-nums">
              {attemptCount}
            </Badge>
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
            onClick={onViewResults}
            className="h-8 px-3 text-xs font-medium sm:h-9"
            data-testid="reopen-comparison-button"
          >
            <span>Compare Solution</span>
          </Button>
        )}
      </div>
    </div>
  )
}
