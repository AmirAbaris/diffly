"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, RotateCcw, Trophy } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { cn } from "@/lib/utils"
import type { LeaderboardEntry } from "@/types/leaderboard"

export interface LeaderboardListProps {
  entries: LeaderboardEntry[]
  totalCatalogChallenges: number
  isAuthenticated: boolean
  hasActiveFilters: boolean
  isPageOutOfRange: boolean
  onResetFilters: () => void
  onGoToFirstPage: () => void
}

function getInitials(username: string): string {
  const cleaned = username.trim()
  return (cleaned.slice(0, 2) || "??").toUpperCase()
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <Badge variant="warning" size="sm" className="font-mono tabular-nums">
        #1
      </Badge>
    )
  }

  if (rank === 2) {
    return (
      <Badge
        variant="secondary"
        size="sm"
        className="font-mono text-muted-foreground tabular-nums"
      >
        #2
      </Badge>
    )
  }

  if (rank === 3) {
    return (
      <Badge
        variant="outline"
        size="sm"
        className="border-amber-700/30 font-mono text-amber-700 tabular-nums dark:text-amber-500"
      >
        #3
      </Badge>
    )
  }

  return (
    <span className="font-mono text-xs text-muted-foreground tabular-nums">
      #{rank}
    </span>
  )
}

export function LeaderboardList({
  entries,
  totalCatalogChallenges,
  isAuthenticated,
  hasActiveFilters,
  isPageOutOfRange,
  onResetFilters,
  onGoToFirstPage,
}: LeaderboardListProps) {
  if (entries.length === 0) {
    return (
      <Card className="py-0">
        <Empty data-testid="leaderboard-empty" className="border-0 py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Trophy aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>
              {isPageOutOfRange
                ? "Page out of range"
                : "No ranked reviewers yet"}
            </EmptyTitle>
            <EmptyDescription>
              {isPageOutOfRange
                ? "There are no rankings on this page. Return to the first page to view the leaderboard."
                : hasActiveFilters
                  ? "No reviewers match the selected timeframe and category. Try widening your filters or solving a challenge."
                  : "Be the first to solve a catalog challenge with a score of 80 or higher."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {isPageOutOfRange ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onGoToFirstPage}
                  data-testid="leaderboard-first-page-button"
                >
                  <RotateCcw data-icon="inline-start" aria-hidden="true" />
                  <span>Go to Page 1</span>
                </Button>
              ) : hasActiveFilters ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onResetFilters}
                  data-testid="leaderboard-reset-filters-button"
                >
                  <RotateCcw data-icon="inline-start" aria-hidden="true" />
                  <span>Reset filters</span>
                </Button>
              ) : null}
              <Button asChild variant="default" size="sm">
                <Link href="/challenges">
                  <span>Browse Challenges</span>
                  <ArrowRight data-icon="inline-end" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      </Card>
    )
  }

  return (
    <Card className="gap-0 py-0" data-testid="leaderboard-list">
      <div
        aria-hidden="true"
        className="hidden border-b border-border bg-muted/30 px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[3.5rem_minmax(0,1fr)_5.5rem_5.5rem_4.5rem_5.5rem] sm:items-center sm:gap-3"
      >
        <span>Rank</span>
        <span>Reviewer</span>
        <span className="text-right">Points</span>
        <span className="text-right">Solved</span>
        <span className="text-right">Hard</span>
        <span className="text-right">Avg Score</span>
      </div>

      <ol className="divide-y divide-border/60">
        {entries.map((entry) => {
          const isCurrentUser = isAuthenticated && entry.is_current_user
          const solvedLabel =
            totalCatalogChallenges > 0
              ? `${entry.challenges_solved}/${totalCatalogChallenges}`
              : String(entry.challenges_solved)

          return (
            <li
              key={`${entry.rank}-${entry.username}`}
              data-testid="leaderboard-row"
              data-current-user={isCurrentUser ? "true" : undefined}
              className={cn(
                "flex flex-col gap-2 px-4 py-3 transition-colors sm:grid sm:grid-cols-[3.5rem_minmax(0,1fr)_5.5rem_5.5rem_4.5rem_5.5rem] sm:items-center sm:gap-3",
                isCurrentUser && "bg-muted/40"
              )}
            >
              <div className="flex items-center justify-between gap-3 sm:contents">
                <div className="flex min-w-0 items-center gap-3 sm:contents">
                  <div className="flex min-w-9 shrink-0 items-center sm:min-w-0">
                    <RankBadge rank={entry.rank} />
                  </div>

                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar className="size-7 shrink-0 border border-border">
                      <AvatarFallback
                        aria-hidden="true"
                        className="bg-muted text-xs font-medium text-foreground"
                      >
                        {getInitials(entry.username)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate font-mono text-sm font-medium text-foreground">
                      @{entry.username}
                    </span>
                    {isCurrentUser ? (
                      <Badge
                        variant="secondary"
                        size="sm"
                        data-testid="leaderboard-you-badge"
                      >
                        You
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <span className="shrink-0 font-pixel text-sm text-foreground tabular-nums sm:text-right">
                  <span className="sr-only">Points </span>
                  {entry.points.toLocaleString()}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-12 font-mono text-xs text-muted-foreground tabular-nums sm:contents sm:pl-0">
                <span className="sm:text-right sm:text-foreground">
                  <span className="sm:sr-only">Solved </span>
                  {solvedLabel}
                </span>
                <span className="sm:text-right">
                  <span className="sm:sr-only">Hard </span>
                  {entry.hard_solved}
                </span>
                <span className="sm:text-right">
                  <span className="sm:sr-only">Avg </span>
                  {Math.round(entry.average_score)}%
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
