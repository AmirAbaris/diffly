import * as React from "react"
import { Badge } from "@/components/ui/badge"
import type { DetectedIssue } from "@/types/challenge"
import { FormattedInlineText, SeverityBadge } from "./score-helpers"

export function DetectedDefectsSection({
  issues,
}: {
  issues: DetectedIssue[]
}) {
  const hasIssues = issues.length > 0

  return (
    <div data-testid="detected-defects-section" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold tracking-tight text-foreground">
          Detected Defects
        </h4>
        <Badge variant="success" size="sm" className="font-mono tabular-nums">
          {issues.length} {issues.length === 1 ? "issue" : "issues"}
        </Badge>
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
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs leading-snug font-semibold break-words text-foreground">
                    {issue.title || issue.id}
                  </span>
                  <SeverityBadge severity={issue.severity || "medium"} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {matchedLinesStr && (
                    <Badge
                      variant="secondary"
                      size="sm"
                      className="font-mono tabular-nums"
                    >
                      Line
                      {issue.matched_lines && issue.matched_lines.length > 1
                        ? "s"
                        : ""}
                      : {matchedLinesStr}
                    </Badge>
                  )}
                  {issue.matched_keywords &&
                    issue.matched_keywords.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-xs text-muted-foreground">
                          Matched:
                        </span>
                        {issue.matched_keywords.map((kw) => (
                          <Badge
                            key={kw}
                            variant="outline"
                            size="sm"
                            className="font-mono"
                          >
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    )}
                </div>

                {issue.explanation && (
                  <p className="border-t border-border/60 pt-2 text-xs leading-relaxed text-muted-foreground">
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
