import * as React from "react"
import { Badge } from "@/components/ui/badge"
import type { MissedIssue } from "@/types/challenge"
import { FormattedInlineText, SeverityBadge } from "./score-helpers"

export function MissedDefectsSection({ issues }: { issues: MissedIssue[] }) {
  const hasMissed = issues.length > 0

  return (
    <div data-testid="missed-defects-section" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold tracking-tight text-foreground">
          Missed Defects
        </h4>
        <Badge
          variant={hasMissed ? "warning" : "success"}
          size="sm"
          className="font-mono tabular-nums"
        >
          {issues.length} {issues.length === 1 ? "issue" : "issues"}
        </Badge>
      </div>

      {!hasMissed ? (
        <div className="flex flex-col gap-1 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs">
          <span className="font-semibold text-emerald-800 dark:text-emerald-300">
            All vulnerabilities identified
          </span>
          <p className="leading-relaxed text-muted-foreground">
            You correctly flagged all expected defect lines and concepts for
            this challenge.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {issues.map((issue) => {
            const expectedLinesStr =
              issue.expected_lines && issue.expected_lines.length > 0
                ? issue.expected_lines.join(", ")
                : null
            const issueKey = issue.id || issue.title || "missed-issue"

            return (
              <div
                key={issueKey}
                data-testid={`missed-issue-${issue.id || issue.title || "defect"}`}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs leading-snug font-semibold break-words text-foreground">
                    {issue.title || issue.id}
                  </span>
                  <SeverityBadge severity={issue.severity || "medium"} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {expectedLinesStr && (
                    <Badge
                      variant="secondary"
                      size="sm"
                      className="font-mono tabular-nums"
                    >
                      Expected line
                      {issue.expected_lines && issue.expected_lines.length > 1
                        ? "s"
                        : ""}
                      : {expectedLinesStr}
                    </Badge>
                  )}
                  {issue.missing_keywords &&
                    issue.missing_keywords.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-xs text-muted-foreground">
                          Overlooked concepts:
                        </span>
                        {issue.missing_keywords.map((kw) => (
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
                    <span className="font-semibold text-foreground">
                      Hint:{" "}
                    </span>
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
