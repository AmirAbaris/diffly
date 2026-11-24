"use client"

import * as React from "react"
import Link from "next/link"
import { AlertCircle, Globe, RefreshCw } from "lucide-react"
import { AccountShell } from "@/components/account/account-shell"
import { ActivityHeatmap } from "@/components/account/activity-heatmap"
import { CategoryMasteryCard } from "@/components/account/category-mastery-card"
import { CustomChallengeStatsCard } from "@/components/account/custom-challenge-stats-card"
import { PrecisionRecallChart } from "@/components/account/precision-recall-chart"
import { PatternsCoachDrawer } from "@/components/coach/patterns-coach-drawer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useAuth } from "@/hooks/use-auth"
import { useUserAnalytics } from "@/hooks/use-user-analytics"
import { useUserStats } from "@/hooks/use-user-stats"
import { useAuthModalStore } from "@/stores/auth-modal-store"
import type { AnalyticsWindowDays, UserAnalytics } from "@/types/analytics"

const WINDOW_OPTIONS: ReadonlyArray<{
  value: AnalyticsWindowDays
  label: string
}> = [
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
  { value: 365, label: "365d" },
]

function StatsSkeleton() {
  return (
    <div data-testid="stats-loading" className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {["sk-1", "sk-2", "sk-3", "sk-4"].map((key) => (
          <Card key={key}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-16" />
            </CardHeader>
          </Card>
        ))}
      </div>
      <Skeleton className="h-52 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}

function StatsDashboardContent({ analytics }: { analytics: UserAnalytics }) {
  const { totalSolved, totalChallenges, averageScore } = useUserStats()

  return (
    <div data-testid="stats-view" className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="gap-1">
            <CardDescription className="text-xs">Active Streak</CardDescription>
            <CardTitle className="font-pixel text-2xl tabular-nums">
              {analytics.streak_days}
              <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
                {analytics.streak_days === 1 ? "day" : "days"}
              </span>
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="gap-1">
            <CardDescription className="text-xs">
              Longest Streak
            </CardDescription>
            <CardTitle className="font-pixel text-2xl tabular-nums">
              {analytics.longest_streak_days}
              <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
                {analytics.longest_streak_days === 1 ? "day" : "days"}
              </span>
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="gap-1">
            <CardDescription className="text-xs">
              Window Submissions
            </CardDescription>
            <CardTitle className="font-pixel text-2xl tabular-nums">
              {analytics.total_submissions}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="gap-1">
            <CardDescription className="text-xs">
              Catalog Solved
            </CardDescription>
            <CardTitle className="font-pixel text-2xl tabular-nums">
              {totalSolved}/{totalChallenges}
              <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
                ({Math.round(averageScore)}% avg)
              </span>
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <ActivityHeatmap
        activity={analytics.activity}
        timezone={analytics.timezone}
        days={analytics.days}
        streakDays={analytics.streak_days}
        longestStreakDays={analytics.longest_streak_days}
      />

      <PrecisionRecallChart trends={analytics.trends} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CategoryMasteryCard categories={analytics.category_mastery} />
        </div>
        <div>
          <CustomChallengeStatsCard custom={analytics.custom} />
        </div>
      </div>
    </div>
  )
}

export function StatsView() {
  const [days, setDays] = React.useState<AnalyticsWindowDays>(90)
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const openAuthModal = useAuthModalStore((s) => s.openAuthModal)
  const { analytics, timezone, error, isLoading, mutate } =
    useUserAnalytics(days)

  const handleWindowChange = (value: string) => {
    if (value === "30" || value === "90" || value === "365") {
      setDays(Number(value) as AnalyticsWindowDays)
    }
  }

  let body: React.ReactNode = null
  if (isLoading && !analytics) {
    body = <StatsSkeleton />
  } else if (error && !analytics) {
    body = (
      <Card data-testid="stats-error-card">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <AlertCircle
              aria-hidden="true"
              className="size-4 shrink-0 text-destructive"
            />
            <div className="flex flex-col gap-1">
              <CardTitle className="text-sm">
                Unable to load analytics
              </CardTitle>
              <CardDescription className="text-xs">
                Please check your connection and try again.
              </CardDescription>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void mutate()}
          >
            <RefreshCw data-icon="inline-start" aria-hidden="true" />
            <span>Retry</span>
          </Button>
        </CardHeader>
      </Card>
    )
  } else if (analytics) {
    body = <StatsDashboardContent analytics={analytics} />
  }

  return (
    <AccountShell
      title="Analytics & Stats"
      description="Category mastery, precision vs. recall trends, and timezone-aware activity."
      actions={
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={String(days)}
          onValueChange={handleWindowChange}
          aria-label="Analytics time window"
          data-testid="stats-window-selector"
        >
          {WINDOW_OPTIONS.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={String(option.value)}
              data-testid={`stats-window-${option.value}`}
              className="px-2.5 text-xs tabular-nums"
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
    >
      {!authLoading && !isAuthenticated && (
        <div
          data-testid="stats-guest-banner"
          className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center"
        >
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-medium text-foreground">
              Viewing guest session progress
            </p>
            <p className="text-xs text-muted-foreground">
              Sign in or create an account to save these metrics permanently
              across devices.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => openAuthModal("signin")}
            data-testid="stats-guest-signin-button"
          >
            Sign In
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 font-mono">
            <Globe aria-hidden="true" className="size-3" />
            <span data-testid="stats-active-timezone">{timezone}</span>
          </Badge>
          {isAuthenticated && (
            <Link
              href="/settings"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Change timezone
            </Link>
          )}
        </div>
      </div>

      <PatternsCoachDrawer />

      {body}
    </AccountShell>
  )
}
