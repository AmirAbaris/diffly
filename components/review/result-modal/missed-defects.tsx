import * as React from "react"
import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MissedIssue } from "@/types/challenge"
import { FormattedInlineText, SeverityBadge } from "./score-helpers"

export function MissedDefectsSection({ issues }: { issues: MissedIssue[] }) {
  const hasMissed = issues.length > 0

  return (
    <div
      data-testid="missed-defects-section"
      className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card/60 p-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
          <h4 className="text-xs font-semibold tracking-wide text-foreground">
            Missed Defects
          </h4>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold",
            hasMissed
              ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
              : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          )}
        >
          {issues.length} {issues.length === 1 ? "issue" : "issues"}
        </span>
      </div>

      {!hasMissed ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-emerald-950 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-emerald-800 dark:text-emerald-300">
              All vulnerabilities identified
            </span>
            <p className="leading-relaxed text-muted-foreground">
              You correctly flagged all expected defect lines and concepts for
              this challenge.
            </p>
          </div>
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
                className="flex flex-col gap-2 rounded-xl border border-amber-500/25 bg-background/80 p-3.5 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="text-xs leading-snug font-semibold break-words text-foreground">
                      {issue.title || issue.id}
                    </span>
                  </div>
                  <SeverityBadge severity={issue.severity || "medium"} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {expectedLinesStr && (
                    <span className="rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      Expected line
                      {issue.expected_lines && issue.expected_lines.length > 1
                        ? "s"
                        : ""}
                      : {expectedLinesStr}
                    </span>
                  )}
                  {issue.missing_keywords &&
                    issue.missing_keywords.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">
                          Overlooked concepts:
                        </span>
                        {issue.missing_keywords.map((kw) => (
                          <span
                            key={kw}
                            className="py-0.2 rounded border border-border/70 bg-muted/50 px-1 font-mono text-[10px] text-muted-foreground"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                </div>

                {issue.explanation && (
                  <p className="border-t border-border/50 pt-2 text-xs leading-relaxed text-muted-foreground">
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
