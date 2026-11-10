"use client"

import * as React from "react"
import {
  ChevronDown,
  ChevronUp,
  Flag,
  MessageSquare,
  Send,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

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

  const wordCount = React.useMemo(() => {
    const trimmed = comment.trim()
    return trimmed ? trimmed.split(/\s+/).length : 0
  }, [comment])

  return (
    <div
      data-testid="arena-comment-drawer"
      className="flex flex-col rounded-lg border border-border bg-card shadow-sm"
    >
      {/* Drawer Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-primary" />
          <h3 className="text-xs font-semibold text-foreground">
            Review Findings & Comments
          </h3>
          {flaggedLines.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {flaggedLines.length} lines targeted
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {flaggedLines.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFlaggedLines}
              className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Clear flags
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
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

      {/* Drawer Body */}
      {!isCollapsed && (
        <div className="flex flex-col gap-3 p-4">
          {/* Flagged Lines Badges List */}
          {flaggedLines.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">
                Flagged lines:
              </span>
              {flaggedLines
                .slice()
                .sort((a, b) => a - b)
                .map((line) => (
                  <Badge
                    key={line}
                    variant="outline"
                    className="gap-1 border-amber-500/30 bg-amber-500/10 pr-1 font-mono text-[11px] text-amber-700 dark:text-amber-400"
                  >
                    <span>L{line}</span>
                    <button
                      type="button"
                      onClick={() => onToggleLine(line)}
                      className="rounded-full p-0.5 hover:bg-amber-500/20"
                      aria-label={`Unflag line ${line}`}
                    >
                      <X className="size-2.5" />
                    </button>
                  </Badge>
                ))}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Flag className="size-3 text-muted-foreground/60" />
              <span>
                Click any line number in the code viewer above to flag defects.
              </span>
            </div>
          )}

          {/* Comment Textarea */}
          <div className="flex flex-col gap-1.5">
            <Textarea
              value={comment}
              onChange={(e) => onChangeComment(e.target.value)}
              placeholder="Explain what vulnerability or antipattern is present, what risk it poses, and how to fix it..."
              className="min-h-[90px] resize-y text-xs leading-relaxed"
            />

            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {wordCount} {wordCount === 1 ? "word" : "words"} (
                {comment.length} chars)
              </span>

              <Button
                size="sm"
                onClick={onSubmitReview}
                disabled={isSubmitting || !comment.trim()}
                className="h-7 gap-1.5 px-3 text-xs"
              >
                <Send className="size-3" />
                <span>Submit Review</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
