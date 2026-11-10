"use client"

import * as React from "react"
import { CheckCircle2, Flag, Loader2, RotateCcw, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useReviewDraft } from "@/hooks/use-review-draft"
import { toast } from "@/hooks/use-toast"
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
  isSubmitting?: boolean
  className?: string
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
  isSubmitting: propIsSubmitting,
  className,
}: SubmissionBarProps) {
  // If draft state is not provided via props, manage it via the hook
  const draft = useReviewDraft(
    propFlaggedLines === undefined || propComments === undefined
      ? challengeSlug
      : ""
  )

  const flaggedLines = propFlaggedLines ?? draft.flaggedLines
  const comments = propComments ?? draft.comments

  const [internalIsSubmitting, setInternalIsSubmitting] = React.useState(false)
  const isSubmitting = propIsSubmitting ?? internalIsSubmitting

  const lineCount = flaggedLines.length
  const charCount = comments.length

  const lineSummary =
    lineCount === 1 ? "1 line flagged" : `${lineCount} lines flagged`
  const charSummary = `${charCount} ${charCount === 1 ? "char" : "chars"} written`
  const summaryCount = `${lineSummary} • ${charSummary}`

  const hasLines = lineCount > 0
  const hasComment = comments.trim().length > 0
  const isSubmitDisabled = !hasLines || !hasComment || isSubmitting

  const tooltipMessage = React.useMemo(() => {
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
  }, [hasLines, hasComment, isSubmitting])

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

      // Clear draft upon successful evaluation submission
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
      {/* Left: Summary Count & Live Feedback */}
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

      {/* Right: Reset Draft and Submit Actions */}
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

        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  type="button"
                  size="sm"
                  disabled={isSubmitDisabled}
                  onClick={handleSubmit}
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
      </div>
    </div>
  )
}
