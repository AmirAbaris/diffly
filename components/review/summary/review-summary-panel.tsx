"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  MIN_REVIEW_TEXT_CHARS,
  validateReview,
  type Finding,
  type FindingId,
  type ReviewDraft,
} from "@/lib/review"
import { cn } from "@/lib/utils"
import { FindingsOutline } from "./findings-outline"
import { SummaryNoteEditor } from "./summary-note-editor"

export interface ReviewSummaryPanelProps {
  draft: ReviewDraft
  onChangeSummaryNote: (note: string) => void
  onSelectFinding: (finding: Finding) => void
  onRemoveFinding: (id: FindingId) => void
  onOpenFlagGuide?: () => void
  onSubmitReview?: () => void
  isSubmitting?: boolean
  disabled?: boolean
  className?: string
}

export function ReviewSummaryPanel({
  draft,
  onChangeSummaryNote,
  onSelectFinding,
  onRemoveFinding,
  onOpenFlagGuide,
  onSubmitReview,
  isSubmitting = false,
  disabled = false,
  className,
}: ReviewSummaryPanelProps) {
  const validation = React.useMemo(() => validateReview(draft), [draft])
  const hasFindings = !validation.blockers.includes("no-findings")
  const hasMinText = !validation.blockers.includes("too-little-text")
  const canSubmit = !disabled && !isSubmitting && validation.valid

  const statusLabel = !hasFindings
    ? "Flag at least 1 line"
    : !hasMinText
      ? `${validation.totalTextChars}/${MIN_REVIEW_TEXT_CHARS} chars required`
      : "Review ready"

  return (
    <div
      data-testid="review-summary-panel"
      className={cn("flex flex-col gap-3", className)}
    >
      <FindingsOutline
        findings={draft.findings}
        onSelectFinding={onSelectFinding}
        onRemoveFinding={onRemoveFinding}
        onOpenFlagGuide={onOpenFlagGuide}
        disabled={disabled}
      />

      <SummaryNoteEditor
        note={draft.summaryNote}
        onChangeNote={onChangeSummaryNote}
        remainingChars={validation.remainingChars}
        isMinLengthMet={hasMinText}
        disabled={disabled}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground tabular-nums">
          <span data-testid="counter-stats">
            {draft.findings.length}{" "}
            {draft.findings.length === 1 ? "finding" : "findings"} (
            {validation.totalTextChars}{" "}
            {validation.totalTextChars === 1 ? "char" : "chars"})
          </span>
          <span className="text-border">•</span>
          <span
            data-testid="validation-indicator"
            className={cn(
              "font-medium",
              validation.valid
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400"
            )}
          >
            {statusLabel}
          </span>
        </div>

        {onSubmitReview && (
          <Button
            type="button"
            size="sm"
            onClick={onSubmitReview}
            disabled={!canSubmit}
            className="h-8 px-3 text-xs"
          >
            <span>{isSubmitting ? "Submitting…" : "Submit Review"}</span>
          </Button>
        )}
      </div>
    </div>
  )
}
