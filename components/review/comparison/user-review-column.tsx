import * as React from "react"
import { Flag, User } from "lucide-react"
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
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-sky-500/20 bg-sky-500/[0.03] p-4.5 sm:p-5 dark:bg-sky-950/[0.12]"
    >
      <div className="flex items-center justify-between border-b border-sky-500/20 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <User className="size-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">Your Review</h4>
            <span className="text-[11px] text-muted-foreground">
              Candidate Submission
            </span>
          </div>
        </div>
        <Badge
          variant="outline"
          className="border-sky-500/30 bg-sky-500/10 text-[10px] font-semibold text-sky-700 dark:text-sky-300"
        >
          Your Critique
        </Badge>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Flag className="size-3.5 text-sky-500" />
            <span>Flagged Lines</span>
          </span>
          <span className="text-[11px] text-muted-foreground">
            {flaggedLines.length} {flaggedLines.length === 1 ? "line" : "lines"}
          </span>
        </div>

        {flaggedLines.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {flaggedLines
              .slice()
              .sort((a, b) => a - b)
              .map((line) => (
                <span
                  key={line}
                  data-testid={`user-flagged-line-${line}`}
                  className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-sky-700 dark:text-sky-300"
                >
                  Line {line}
                </span>
              ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-background/50 p-3 text-center text-xs text-muted-foreground">
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
          className="min-h-[80px] rounded-xl border border-border/80 bg-background/90 p-3.5 text-xs leading-relaxed text-foreground"
        >
          {comments.trim() ? (
            <div className="font-sans [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
              {comments}
            </div>
          ) : (
            <span className="text-muted-foreground italic">
              No written critique comments provided.
            </span>
          )}
        </div>
      </div>

      <div className="mt-auto rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
        <strong className="text-sky-700 dark:text-sky-300">
          Review Phrasing Note:
        </strong>{" "}
        Notice how senior staff comments clearly state the
        security/architectural impact, identify the root cause, and provide a
        concrete fix blueprint.
      </div>
    </section>
  )
}
