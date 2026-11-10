import * as React from "react"
import { Check, CheckCircle2 } from "lucide-react"
import type { DetectedIssue } from "@/types/challenge"
import { FormattedInlineText, SeverityBadge } from "./score-helpers"

export function DetectedDefectsSection({
  issues,
}: {
  issues: DetectedIssue[]
}) {
  const hasIssues = issues.length > 0

  return (
    <div
      data-testid="detected-defects-section"
      className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card/60 p-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          <h4 className="text-xs font-semibold tracking-wide text-foreground">
            Detected Defects
          </h4>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
          {issues.length} {issues.length === 1 ? "issue" : "issues"}
        </span>
      </div>

      {!hasIssues ? (
        <div className="flex flex-col gap-1 rounded-xl border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            No vulnerabilities matched
          </span>
          <p className="leading-relaxed">
            Review the code snippet to identify defect locations and explain
            root causes to earn detection credit.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {issues.map((issue) => {
            const matchedLinesStr =
              issue.matched_lines && issue.matched_lines.length > 0
                ? issue.matched_lines.join(", ")
                : null
            const issueKey = issue.id || issue.title || "detected-issue"

            return (
              <div
                key={issueKey}
                data-testid={`detected-issue-${issue.id || issue.title || "defect"}`}
                className="flex flex-col gap-2 rounded-xl border border-emerald-500/20 bg-background/80 p-3.5 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs leading-snug font-semibold break-words text-foreground">
                      {issue.title || issue.id}
                    </span>
                  </div>
                  <SeverityBadge severity={issue.severity || "medium"} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {matchedLinesStr && (
                    <span className="rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      Line
                      {issue.matched_lines && issue.matched_lines.length > 1
                        ? "s"
                        : ""}
                      : {matchedLinesStr}
                    </span>
                  )}
                  {issue.matched_keywords &&
                    issue.matched_keywords.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">
                          Matched:
                        </span>
                        {issue.matched_keywords.map((kw) => (
                          <span
                            key={kw}
                            className="py-0.2 rounded border border-border/70 bg-muted/50 px-1 font-mono text-[10px] text-foreground"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                </div>

                {issue.explanation && (
                  <p className="border-t border-border/50 pt-2 text-xs leading-relaxed text-muted-foreground">
                    <FormattedInlineText text={issue.explanation} />
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
