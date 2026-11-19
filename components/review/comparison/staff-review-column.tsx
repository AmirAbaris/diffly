import * as React from "react"
import { ArrowRight } from "lucide-react"
import { MarkdownPreview } from "@/components/review/markdown-preview"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ChallengeSolutionResponse } from "@/types/challenge"

export function getSeverityBadgeStyle(severity?: string) {
  const s = (severity || "").toLowerCase().trim()
  if (s === "critical") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
  }
  if (s === "high") {
    return "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400"
  }
  if (s === "medium") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
  }
  return "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400"
}

export interface StaffReviewColumnProps {
  solution: ChallengeSolutionResponse | null
  onOpenDiff: () => void
}

export function StaffReviewColumn({
  solution,
  onOpenDiff,
}: StaffReviewColumnProps) {
  const issues = solution?.expected_issues ?? []

  return (
    <section
      data-testid="staff-review-column"
      aria-label="Staff Reviewer Critique"
      className="flex min-w-0 flex-col gap-4"
    >
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex flex-col gap-0.5">
          <h4 className="text-sm font-semibold text-foreground">
            Staff Reviewer Critique
          </h4>
          <span className="text-xs text-muted-foreground">
            Senior Staff Engineer
          </span>
        </div>
        <Badge variant="success" size="sm">
          Canonical Solution
        </Badge>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-xs font-semibold text-foreground">
          Canonical Review Comment
        </span>
        <div
          data-testid="staff-canonical-review"
          className="min-w-0 rounded-xl border border-border bg-background p-3.5 text-xs leading-relaxed text-foreground"
        >
          {solution?.canonical_review ? (
            <MarkdownPreview
              content={solution.canonical_review}
              className="border-0 bg-transparent p-0 shadow-none"
            />
          ) : (
            <span className="text-muted-foreground">
              No canonical review critique available for this challenge.
            </span>
          )}
        </div>
      </div>

      {issues.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              Defect Classification & Root Causes
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {issues.length} {issues.length === 1 ? "defect" : "defects"}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {issues.map((issue) => (
              <div
                key={issue.id}
                data-testid={`defect-item-${issue.id}`}
                className="flex flex-col gap-1.5 rounded-xl border border-border bg-background p-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="font-semibold text-foreground">
                    {issue.title}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {issue.lines && issue.lines.length > 0 && (
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        Lines: {issue.lines.join(", ")}
                      </span>
                    )}
                    <Badge
                      variant="outline"
                      size="sm"
                      className={cn(
                        "capitalize",
                        getSeverityBadgeStyle(issue.severity)
                      )}
                    >
                      {issue.severity}
                    </Badge>
                  </div>
                </div>

                {issue.explanation && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {issue.explanation}
                  </p>
                )}

                {issue.keywords && issue.keywords.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {issue.keywords.map((kw) => (
                      <Badge
                        key={kw}
                        variant="secondary"
                        size="sm"
                        className="font-mono"
                      >
                        {kw}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {solution?.recommended_fix_diff && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              Recommended Code Diff
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onOpenDiff}
              className="h-6 gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
              data-testid="switch-to-diff-btn"
            >
              <span>Full Diff View</span>
              <ArrowRight className="size-3" />
            </Button>
          </div>

          <pre className="max-h-[140px] overflow-x-auto rounded-xl border border-border bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-100">
            <code>{solution.recommended_fix_diff.slice(0, 300)}…</code>
          </pre>
        </div>
      )}
    </section>
  )
}
