"use client"

import * as React from "react"
import { History, RotateCcw, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { HistoryItem } from "@/components/review/history/history-item"
import { getScoreBadgeClasses } from "@/components/review/history/history-helpers"
import { useSubmissionHistory } from "@/hooks/use-submission-history"
import { cn } from "@/lib/utils"
import type { SubmissionHistoryItem } from "@/types/challenge"

export interface SubmissionHistoryDrawerProps {
  challengeSlug: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
  asCard?: boolean
}

interface HistoryContentProps {
  submissions: SubmissionHistoryItem[]
  isLoading: boolean
  error: unknown
  onRetry: () => void
}

function HistoryContent({
  submissions,
  isLoading,
  error,
  onRetry,
}: HistoryContentProps) {
  const [expandedId, setExpandedId] = React.useState<number | null>(null)

  const handleToggle = React.useCallback((id: number) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  if (isLoading) {
    return (
      <div
        data-testid="history-drawer-loading"
        className="flex flex-col gap-3 py-2"
      >
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div
        data-testid="history-drawer-error"
        className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center"
      >
        <p className="text-xs text-destructive">
          Failed to load submission history.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="gap-1.5 text-xs"
        >
          <RotateCcw className="size-3" />
          <span>Retry</span>
        </Button>
      </div>
    )
  }

  if (!submissions.length) {
    return (
      <div
        data-testid="history-drawer-empty"
        className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/80 bg-muted/20 p-8 text-center"
      >
        <History className="size-8 text-muted-foreground/50" />
        <h4 className="text-sm font-semibold text-foreground">
          No attempts recorded yet
        </h4>
        <p className="max-w-xs text-xs text-muted-foreground">
          Submit a review for this challenge to track your score progression and
          review past feedback across attempts.
        </p>
      </div>
    )
  }

  return (
    <div
      data-testid="history-drawer-list"
      className="flex flex-col gap-2.5 overflow-y-auto pr-1"
    >
      {submissions.map((item) => (
        <HistoryItem
          key={item.id || item.submission_id}
          item={item}
          isExpanded={expandedId === (item.id || item.submission_id)}
          onToggle={() => handleToggle(item.id || item.submission_id)}
        />
      ))}
    </div>
  )
}

function HistoryDrawerHeader({
  submissions,
}: {
  submissions: SubmissionHistoryItem[]
}) {
  const bestScore = React.useMemo(() => {
    if (!submissions.length) return null
    return Math.max(...submissions.map((s) => s.score))
  }, [submissions])

  const bestScoreStyle =
    bestScore !== null ? getScoreBadgeClasses(bestScore) : null

  return (
    <DialogHeader className="gap-1 pr-10 text-left">
      <div className="flex flex-wrap items-center gap-2">
        <History className="size-4 text-primary" />
        <DialogTitle className="text-base font-bold sm:text-lg">
          Submission History
        </DialogTitle>
        {submissions.length > 0 && (
          <Badge variant="secondary" className="text-xs font-semibold">
            {submissions.length}{" "}
            {submissions.length === 1 ? "attempt" : "attempts"}
          </Badge>
        )}
        {bestScore !== null && bestScoreStyle && (
          <Badge
            variant={bestScoreStyle.badgeVariant}
            className={cn(
              "gap-1 text-xs font-semibold",
              bestScoreStyle.className
            )}
          >
            <TrendingUp className="size-3" />
            Best: {bestScore}%
          </Badge>
        )}
      </div>
      <DialogDescription className="text-xs text-muted-foreground">
        View your past submissions and track how your score improved across
        attempts.
      </DialogDescription>
    </DialogHeader>
  )
}

export function SubmissionHistoryDrawer({
  challengeSlug,
  open,
  onOpenChange,
  className,
  asCard = false,
}: SubmissionHistoryDrawerProps) {
  const { submissions, isLoading, error, mutate } =
    useSubmissionHistory(challengeSlug)

  const isControlledDialog = open !== undefined && onOpenChange !== undefined

  if (asCard || !isControlledDialog) {
    return (
      <div
        data-testid="submission-history-drawer"
        className={cn(
          "flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm",
          className
        )}
      >
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <History className="size-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Submission History
            </h3>
            {submissions.length > 0 && (
              <Badge variant="secondary" className="text-[11px]">
                {submissions.length}
              </Badge>
            )}
          </div>
        </div>

        <HistoryContent
          submissions={submissions}
          isLoading={isLoading}
          error={error}
          onRetry={() => mutate()}
        />
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="submission-history-drawer"
        className={cn(
          "max-h-[85vh] w-full overflow-hidden rounded-2xl border border-border/80 bg-background/95 p-5 shadow-2xl backdrop-blur-xl sm:max-w-xl sm:p-6",
          className
        )}
      >
        <HistoryDrawerHeader submissions={submissions} />

        <div className="mt-2 max-h-[60vh] overflow-y-auto pr-1">
          <HistoryContent
            submissions={submissions}
            isLoading={isLoading}
            error={error}
            onRetry={() => mutate()}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
