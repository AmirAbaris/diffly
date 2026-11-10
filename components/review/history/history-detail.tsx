"use client"

import * as React from "react"
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Flag,
  MessageSquare,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { SubmissionHistoryItem } from "@/types/challenge"

interface HistoryDetailProps {
  item: SubmissionHistoryItem
}

export function HistoryDetail({ item }: HistoryDetailProps) {
  return (
    <div
      data-testid={`history-detail-${item.id}`}
      className="flex flex-col gap-3 rounded-md border border-border/60 bg-muted/30 p-3.5 text-xs text-foreground"
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
          <Flag className="size-3.5 text-amber-500" />
          <span>Flagged Lines</span>
        </div>
        {item.flagged_lines.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {item.flagged_lines.map((lineNum) => (
              <Badge
                key={lineNum}
                variant="secondary"
                className="font-mono text-[11px] font-medium"
              >
                Line {lineNum}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground italic">No lines flagged</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
          <MessageSquare className="size-3.5 text-primary" />
          <span>Written Review Comment</span>
        </div>
        <div className="rounded border border-border/80 bg-background/80 p-2.5 font-mono text-xs whitespace-pre-wrap text-foreground">
          {item.comments || "(No comment recorded)"}
        </div>
      </div>

      {item.feedback && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
            <Award className="size-3.5 text-emerald-500" />
            <span>Automated Feedback</span>
          </div>
          <p className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-xs leading-relaxed text-foreground">
            {item.feedback}
          </p>
        </div>
      )}

      {item.detected_issues && item.detected_issues.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            <span>Detected Defects ({item.detected_issues.length})</span>
          </div>
          <ul className="flex flex-col gap-1">
            {item.detected_issues.map((issue) => (
              <li
                key={issue.id || issue.title}
                className="flex items-start gap-1.5 text-xs text-muted-foreground"
              >
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span className="font-medium text-foreground">
                  {issue.title}
                </span>
                {issue.severity && (
                  <Badge
                    variant="outline"
                    className="ml-auto h-4 px-1 text-[10px]"
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
          <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
            <AlertTriangle className="size-3.5 text-amber-500" />
            <span>Missed Defects ({item.missed_issues.length})</span>
          </div>
          <ul className="flex flex-col gap-1">
            {item.missed_issues.map((issue) => (
              <li
                key={issue.id || issue.title}
                className="flex items-start gap-1.5 text-xs text-muted-foreground"
              >
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-500" />
                <span className="font-medium text-foreground">
                  {issue.title}
                </span>
                {issue.severity && (
                  <Badge
                    variant="outline"
                    className="ml-auto h-4 px-1 text-[10px]"
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
