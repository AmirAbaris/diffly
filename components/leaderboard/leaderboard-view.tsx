"use client"

import * as React from "react"
import { RotateCcw } from "lucide-react"
import { CurrentUserRankCard } from "@/components/leaderboard/current-user-rank-card"
import { LeaderboardFiltersBar } from "@/components/leaderboard/leaderboard-filters"
import { LeaderboardList } from "@/components/leaderboard/leaderboard-list"
import { LeaderboardPagination } from "@/components/leaderboard/leaderboard-pagination"
import { LeaderboardSkeleton } from "@/components/leaderboard/leaderboard-skeleton"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/hooks/use-auth"
import {
  useLeaderboard,
  useLeaderboardVisibility,
} from "@/hooks/use-leaderboard"
import { useLeaderboardFilters } from "@/hooks/use-leaderboard-filters"
import { toast } from "@/hooks/use-toast"

export function LeaderboardView() {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { filters, setWindow, setCategory, setPage, resetFilters } =
    useLeaderboardFilters()
  const {
    data,
    entries,
    currentUser,
    totalCatalogChallenges,
    totalPages,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useLeaderboard(filters)
  const { setVisibility, isUpdating } = useLeaderboardVisibility()

  const handleToggleVisibility = async (visible: boolean) => {
    try {
      await setVisibility(visible)
      toast({
        title: visible ? "Visible on leaderboard" : "Hidden from leaderboard",
        description: visible
          ? "Your ranking is now shown on the public leaderboard."
          : "Your profile has been hidden from public rankings.",
        variant: "default",
      })
    } catch {
      toast({
        title: "Could not update visibility",
        description: "Please try again in a moment.",
        variant: "destructive",
      })
    }
  }

  const hasActiveFilters = filters.window !== "all" || filters.category !== null

  return (
    <div
      data-testid="leaderboard-page"
      className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10"
    >
      <header className="flex flex-col gap-1.5">
        <h1 className="font-pixel text-2xl tracking-tight text-balance text-foreground sm:text-3xl">
          Leaderboard
        </h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Best solved score &gt;= 80 weighted by difficulty: Easy 1x, Medium 2x,
          Hard 3x.
        </p>
      </header>

      <LeaderboardFiltersBar
        window={filters.window}
        category={filters.category}
        onWindowChange={setWindow}
        onCategoryChange={setCategory}
      />

      {error ? (
        <Card size="sm" data-testid="leaderboard-error">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium text-foreground">
                Failed to load leaderboard
              </p>
              <p className="text-xs text-pretty text-muted-foreground">
                Something went wrong while fetching rankings. Please try again.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void mutate()}
              data-testid="leaderboard-retry-button"
              className="w-fit shrink-0"
            >
              <RotateCcw data-icon="inline-start" aria-hidden="true" />
              <span>Retry</span>
            </Button>
          </CardContent>
        </Card>
      ) : isLoading && !data ? (
        <LeaderboardSkeleton />
      ) : (
        <div className="flex flex-col gap-6">
          <CurrentUserRankCard
            currentUser={currentUser}
            totalCatalogChallenges={totalCatalogChallenges}
            isAuthenticated={isAuthenticated}
            authLoading={authLoading}
            isUpdatingVisibility={isUpdating}
            onToggleVisibility={handleToggleVisibility}
          />

          <LeaderboardList
            entries={entries}
            totalCatalogChallenges={totalCatalogChallenges}
            isAuthenticated={isAuthenticated}
            hasActiveFilters={hasActiveFilters}
            isPageOutOfRange={Boolean(
              data && data.total_entries > 0 && entries.length === 0
            )}
            onResetFilters={resetFilters}
            onGoToFirstPage={() => setPage(1)}
          />

          <LeaderboardPagination
            page={Math.min(filters.page, totalPages)}
            totalPages={totalPages}
            isValidating={isValidating}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  )
}
