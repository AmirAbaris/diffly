"use client"

import * as React from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { ReviewCommentEditor } from "@/components/review/review-comment-editor"
import { ReviewSummaryPanel } from "@/components/review/summary/review-summary-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Finding, FindingId, ReviewDraft } from "@/lib/review"
import type { FlaggedLine } from "@/types/challenge"

export interface ArenaCommentDrawerProps {
  reviewDraft?: ReviewDraft
  onChangeSummaryNote?: (note: string) => void
  onSelectFinding?: (finding: Finding) => void
  onRemoveFinding?: (id: FindingId) => void
  flaggedLines: FlaggedLine[]
  onToggleLine: (line: FlaggedLine) => void
  onClearFlaggedLines: () => void
  onOpenFlagGuide?: () => void
  comment: string
  onChangeComment: (comment: string) => void
  onSubmitReview?: () => void
  isSubmitting?: boolean
}

export function ArenaCommentDrawer({
  reviewDraft,
  onChangeSummaryNote,
  onSelectFinding,
  onRemoveFinding,
  flaggedLines,
  onToggleLine,
  onClearFlaggedLines,
  onOpenFlagGuide,
  comment,
  onChangeComment,
  onSubmitReview,
  isSubmitting = false,
}: ArenaCommentDrawerProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(false)

  const findingCount = reviewDraft
    ? reviewDraft.findings.length
    : flaggedLines.length

  return (
    <div
      data-testid="arena-comment-drawer"
      className="flex flex-col rounded-lg border border-border bg-card shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-foreground">
            Review Findings
          </h3>
          {findingCount > 0 && (
            <Badge variant="secondary" size="sm" className="tabular-nums">
              {findingCount}{" "}
              {reviewDraft
                ? findingCount === 1
                  ? "finding"
                  : "findings"
                : findingCount === 1
                  ? "line targeted"
                  : "lines targeted"}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="size-6 p-0 text-muted-foreground hover:text-foreground"
            aria-label={
              isCollapsed ? "Expand review drawer" : "Collapse review drawer"
            }
          >
            {isCollapsed ? (
              <ChevronUp aria-hidden="true" className="size-4" />
            ) : (
              <ChevronDown aria-hidden="true" className="size-4" />
            )}
          </Button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-4">
          {reviewDraft &&
          onChangeSummaryNote &&
          onSelectFinding &&
          onRemoveFinding ? (
            <ReviewSummaryPanel
              draft={reviewDraft}
              onChangeSummaryNote={onChangeSummaryNote}
              onSelectFinding={onSelectFinding}
              onRemoveFinding={onRemoveFinding}
              onOpenFlagGuide={onOpenFlagGuide}
            />
          ) : (
            <ReviewCommentEditor
              flaggedLines={flaggedLines}
              onToggleLine={onToggleLine}
              onClearFlaggedLines={onClearFlaggedLines}
              onOpenFlagGuide={onOpenFlagGuide}
              comment={comment}
              onChangeComment={onChangeComment}
              onSubmitReview={onSubmitReview}
              isSubmitting={isSubmitting}
            />
          )}
        </div>
      )}
    </div>
  )
}
