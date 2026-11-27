"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Eye, EyeOff, LogIn } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useAuthModalStore } from "@/stores/auth-modal-store"
import type { CurrentUserRank } from "@/types/leaderboard"

export interface CurrentUserRankCardProps {
  currentUser: CurrentUserRank | null
  totalCatalogChallenges: number
  isAuthenticated: boolean
  authLoading: boolean
  isUpdatingVisibility: boolean
  onToggleVisibility: (visible: boolean) => void
}

function formatPercentile(percentile: number): string {
  const clamped = Math.max(0.1, Math.min(100, percentile))
  const formatted = Number.isInteger(clamped)
    ? String(clamped)
    : clamped.toFixed(1)
  return `Top ${formatted}%`
}

export function CurrentUserRankCard({
  currentUser,
  totalCatalogChallenges,
  isAuthenticated,
  authLoading,
  isUpdatingVisibility,
  onToggleVisibility,
}: CurrentUserRankCardProps) {
  const openAuthModal = useAuthModalStore((s) => s.openAuthModal)

  if (!authLoading && !isAuthenticated) {
    return (
      <Card size="sm" data-testid="leaderboard-signed-out-banner">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-foreground">
              Track your rank on the leaderboard
            </p>
            <p className="text-xs text-pretty text-muted-foreground">
              Sign in to save your solved challenges, earn difficulty-weighted
              points, and compare your standing.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openAuthModal("signin")}
            data-testid="leaderboard-signin-button"
            className="w-fit shrink-0"
          >
            <LogIn data-icon="inline-start" aria-hidden="true" />
            <span>Sign In</span>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (authLoading || !currentUser) {
    return null
  }

  if (currentUser.hidden) {
    return (
      <Card size="sm" data-testid="leaderboard-user-rank-card">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="max-w-full truncate font-mono text-sm font-medium text-foreground">
                @{currentUser.username}
              </span>
              <Badge variant="outline" data-testid="leaderboard-hidden-badge">
                Hidden from leaderboard
              </Badge>
            </div>
            <p className="text-xs text-pretty text-muted-foreground">
              Your profile is excluded from public rankings. You can opt back in
              at any time.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUpdatingVisibility}
            onClick={() => onToggleVisibility(true)}
            data-testid="leaderboard-visibility-toggle"
            className="w-fit shrink-0"
          >
            <Eye data-icon="inline-start" aria-hidden="true" />
            <span>Show on leaderboard</span>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (currentUser.rank === null) {
    return (
      <Card size="sm" data-testid="leaderboard-user-rank-card">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="max-w-full truncate font-mono text-sm font-medium text-foreground">
                @{currentUser.username}
              </span>
              <Badge variant="secondary">Unranked in this view</Badge>
            </div>
            <p className="text-xs text-pretty text-muted-foreground">
              Solve a catalog challenge with a score of 80 or higher to appear
              in this ranking.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/challenges">
                <span>Browse Challenges</span>
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isUpdatingVisibility}
              onClick={() => onToggleVisibility(false)}
              data-testid="leaderboard-visibility-toggle"
            >
              <EyeOff data-icon="inline-start" aria-hidden="true" />
              <span>Hide me</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const solvedRatio =
    totalCatalogChallenges > 0
      ? `${currentUser.challenges_solved}/${totalCatalogChallenges}`
      : String(currentUser.challenges_solved)

  return (
    <Card size="sm" data-testid="leaderboard-user-rank-card">
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span
            data-testid="current-user-rank-value"
            className="font-pixel text-2xl leading-none tracking-tight text-foreground tabular-nums"
          >
            #{currentUser.rank}
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="max-w-full truncate font-mono text-sm font-medium text-foreground">
                @{currentUser.username}
              </span>
              {currentUser.percentile !== null ? (
                <Badge variant="secondary" className="tabular-nums">
                  {formatPercentile(currentUser.percentile)}
                </Badge>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                Points{" "}
                <strong className="font-pixel text-foreground tabular-nums">
                  {currentUser.points.toLocaleString()}
                </strong>
              </span>
              <span>
                Solved{" "}
                <strong className="font-mono font-medium text-foreground tabular-nums">
                  {solvedRatio}
                </strong>
              </span>
              <span>
                Avg{" "}
                <strong className="font-mono font-medium text-foreground tabular-nums">
                  {Math.round(currentUser.average_score)}%
                </strong>
              </span>
            </div>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isUpdatingVisibility}
          onClick={() => onToggleVisibility(false)}
          data-testid="leaderboard-visibility-toggle"
          className="w-fit shrink-0"
        >
          <EyeOff data-icon="inline-start" aria-hidden="true" />
          <span>Hide me</span>
        </Button>
      </CardContent>
    </Card>
  )
}
