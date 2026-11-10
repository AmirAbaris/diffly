import * as React from "react"
import { Badge } from "@/components/ui/badge"

export interface UserReviewColumnProps {
  flaggedLines: number[]
  comments: string
}

export function UserReviewColumn({
  flaggedLines,
  comments,
}: UserReviewColumnProps) {
  return (
    <section
      data-testid="user-review-column"
      aria-label="Your Review"
      className="flex min-w-0 flex-col gap-4"
    >
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex flex-col gap-0.5">
          <h4 className="text-sm font-semibold text-foreground">Your Review</h4>
          <span className="text-xs text-muted-foreground">
            Candidate Submission
          </span>
        </div>
        <Badge variant="outline" size="sm">
          Your Critique
        </Badge>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">
            Flagged Lines
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {flaggedLines.length} {flaggedLines.length === 1 ? "line" : "lines"}
          </span>
        </div>

        {flaggedLines.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {flaggedLines
              .slice()
              .sort((a, b) => a - b)
              .map((line) => (
                <Badge
                  key={line}
                  variant="secondary"
                  size="sm"
                  data-testid={`user-flagged-line-${line}`}
                  className="font-mono tabular-nums"
                >
                  Line {line}
                </Badge>
              ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-center text-xs text-muted-foreground">
            No specific code lines were flagged in this submission.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-foreground">
          Your Written Comments
        </span>
        <div
          data-testid="user-review-comments"
          className="min-h-[80px] rounded-xl border border-border bg-background p-3.5 text-xs leading-relaxed text-foreground"
        >
          {comments.trim() ? (
            <div className="font-sans [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
              {comments}
            </div>
          ) : (
            <span className="text-muted-foreground">
              No written critique comments provided.
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
