"use client"

import * as React from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ReviewCommentEditor } from "@/components/review/review-comment-editor"

export interface ArenaCommentDrawerProps {
  flaggedLines: number[]
  onToggleLine: (line: number) => void
  onClearFlaggedLines: () => void
  comment: string
  onChangeComment: (comment: string) => void
  onSubmitReview?: () => void
  isSubmitting?: boolean
}

export function ArenaCommentDrawer({
  flaggedLines,
  onToggleLine,
  onClearFlaggedLines,
  comment,
  onChangeComment,
  onSubmitReview,
  isSubmitting = false,
}: ArenaCommentDrawerProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(false)

  return (
    <div
      data-testid="arena-comment-drawer"
      className="flex flex-col rounded-lg border border-border bg-card shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-foreground">
            Review Findings & Comments
          </h3>
          {flaggedLines.length > 0 && (
            <Badge variant="secondary" size="sm" className="tabular-nums">
              {flaggedLines.length}{" "}
              {flaggedLines.length === 1 ? "line" : "lines"} targeted
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
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </Button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-4">
          <ReviewCommentEditor
            flaggedLines={flaggedLines}
            onToggleLine={onToggleLine}
            onClearFlaggedLines={onClearFlaggedLines}
            comment={comment}
            onChangeComment={onChangeComment}
            onSubmitReview={onSubmitReview}
            isSubmitting={isSubmitting}
          />
        </div>
      )}
    </div>
  )
}
