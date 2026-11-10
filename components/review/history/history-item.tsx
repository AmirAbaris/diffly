"use client"

import * as React from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
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
          <span className="font-mono text-xs font-semibold text-foreground tabular-nums">
            Attempt #{item.attempt_number}
          </span>

          <Badge
            variant={scoreStyle.badgeVariant}
            size="sm"
            className={cn("tabular-nums", scoreStyle.className)}
          >
            {item.score}%
          </Badge>

          <Badge variant="secondary" size="sm" className="tabular-nums">
            {detectedCount} {detectedCount === 1 ? "issue" : "issues"} detected
          </Badge>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground tabular-nums">
          <span className="hidden sm:inline">{formattedDate}</span>
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
