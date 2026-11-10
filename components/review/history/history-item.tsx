"use client"

import * as React from "react"
import { CheckCircle2, ChevronDown, ChevronUp, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  formatAttemptDate,
  getScoreBadgeClasses,
} from "@/components/review/history/history-helpers"
import { HistoryDetail } from "@/components/review/history/history-detail"
import { cn } from "@/lib/utils"
import type { SubmissionHistoryItem } from "@/types/challenge"

interface HistoryItemProps {
  item: SubmissionHistoryItem
  isExpanded: boolean
  onToggle: () => void
}

export function HistoryItem({ item, isExpanded, onToggle }: HistoryItemProps) {
  const scoreStyle = getScoreBadgeClasses(item.score)
  const detectedCount = item.detected_issues?.length ?? 0
  const formattedDate = formatAttemptDate(item.created_at)

  return (
    <div
      data-testid={`history-item-${item.id}`}
      className={cn(
        "flex flex-col rounded-lg border transition-colors",
        isExpanded
          ? "border-border bg-card shadow-xs"
          : "border-border/70 bg-card/60 hover:border-border hover:bg-card/90"
      )}
    >
      <Button
        type="button"
        variant="ghost"
        onClick={onToggle}
        className="flex h-auto w-full items-center justify-between gap-3 p-3 text-left hover:bg-transparent"
        aria-expanded={isExpanded}
        data-testid={`history-item-trigger-${item.id}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-bold text-foreground">
            Attempt #{item.attempt_number}
          </span>

          <Badge
            variant={scoreStyle.badgeVariant}
            className={cn("px-2 py-0.5 text-xs", scoreStyle.className)}
          >
            {item.score}%
          </Badge>

          <Badge
            variant="secondary"
            className="gap-1 px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground"
          >
            <CheckCircle2 className="size-3 text-emerald-500" />
            <span>
              {detectedCount} {detectedCount === 1 ? "issue" : "issues"}{" "}
              detected
            </span>
          </Badge>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden items-center gap-1 sm:inline-flex">
            <Clock className="size-3" />
            <span>{formattedDate}</span>
          </span>
          {isExpanded ? (
            <ChevronUp className="size-4 text-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </div>
      </Button>

      {isExpanded && (
        <div className="border-t border-border/60 p-3 pt-2">
          <HistoryDetail item={item} />
        </div>
      )}
    </div>
  )
}
