"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import type { SubmissionHistoryItem } from "@/types/challenge"

interface HistoryDetailProps {
  item: SubmissionHistoryItem
}

export function HistoryDetail({ item }: HistoryDetailProps) {
  return (
    <div
      data-testid={`history-detail-${item.id}`}
      className="flex flex-col gap-3 text-xs text-foreground"
    >
      <div className="flex flex-col gap-1.5">
        <span className="font-semibold text-muted-foreground">
          Flagged Lines
        </span>
        {item.flagged_lines.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {item.flagged_lines.map((lineNum) => (
              <Badge
                key={lineNum}
                variant="secondary"
                size="sm"
                className="font-mono tabular-nums"
              >
                Line {lineNum}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">No lines flagged</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-semibold text-muted-foreground">
          Written Review Comment
        </span>
        <div className="rounded-lg border border-border bg-muted/30 p-2.5 font-mono text-xs whitespace-pre-wrap text-foreground">
          {item.comments || "(No comment recorded)"}
        </div>
      </div>

      {item.feedback && (
        <div className="flex flex-col gap-1.5">
          <span className="font-semibold text-muted-foreground">
            Automated Feedback
          </span>
          <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-xs leading-relaxed text-foreground">
            {item.feedback}
          </p>
        </div>
      )}

      {item.detected_issues && item.detected_issues.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="font-semibold text-muted-foreground">
            Detected Defects ({item.detected_issues.length})
          </span>
          <ul className="flex flex-col gap-1">
            {item.detected_issues.map((issue) => (
              <li
                key={issue.id || issue.title}
                className="flex items-start gap-1.5 text-xs text-muted-foreground"
              >
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span className="font-medium text-foreground">
                  {issue.title}
                </span>
                {issue.severity && (
                  <Badge
                    variant="outline"
                    size="sm"
                    className="ml-auto capitalize"
                  >
                    {issue.severity}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {item.missed_issues && item.missed_issues.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="font-semibold text-muted-foreground">
            Missed Defects ({item.missed_issues.length})
          </span>
          <ul className="flex flex-col gap-1">
            {item.missed_issues.map((issue) => (
              <li
                key={issue.id || issue.title}
                className="flex items-start gap-1.5 text-xs text-muted-foreground"
              >
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                <span className="font-medium text-foreground">
                  {issue.title}
                </span>
                {issue.severity && (
                  <Badge
                    variant="outline"
                    size="sm"
                    className="ml-auto capitalize"
                  >
                    {issue.severity}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
