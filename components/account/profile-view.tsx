"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Calendar, CheckCircle2, Flame, Mail } from "lucide-react"
import { AccountAuthEmpty } from "@/components/account/account-auth-empty"
import { AccountShell } from "@/components/account/account-shell"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth, type AuthUser } from "@/hooks/use-auth"
import { useUserAnalytics } from "@/hooks/use-user-analytics"
import { useUserStats } from "@/hooks/use-user-stats"

const MEMBER_SINCE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

function formatMemberSince(isoDate?: string): string {
  if (!isoDate) return "Member"
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) return "Member"
  return MEMBER_SINCE_FORMATTER.format(parsed)
}

function ProfileSkeleton() {
  return (
    <div data-testid="profile-loading" className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex items-center gap-4 pt-6">
          <Skeleton className="size-14 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-52" />
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {["sk-1", "sk-2", "sk-3", "sk-4"].map((key) => (
          <Card key={key}>
            <CardHeader>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-7 w-16" />
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  )
}

interface MasterySummaryItem {
  category: string
  solved: number
  total: number
  percentage: number
}

function ProfileAuthenticatedContent({ user }: { user: AuthUser }) {
  const {
    totalSolved,
    totalChallenges,
    totalAttempted,
    averageScore,
    streakDays,
    timezone,
    customAttempted,
    customSolved,
    categories,
  } = useUserStats()
  const { analytics, isLoading: analyticsLoading } = useUserAnalytics(90)

  const masteryItems: MasterySummaryItem[] = React.useMemo(() => {
    if (analytics?.category_mastery && analytics.category_mastery.length > 0) {
      return analytics.category_mastery.map((item) => ({
        category: item.category,
        solved: item.solved,
        total: item.total,
        percentage: Math.round(item.mastery),
      }))
    }
    if (analyticsLoading) {
      return []
    }
    return categories.map((cat) => ({
      category: cat.category,
      solved: cat.solved,
      total: cat.total,
      percentage:
        cat.total > 0 ? Math.round((cat.solved / cat.total) * 100) : 0,
    }))
  }, [analytics, analyticsLoading, categories])

  const initials = (user.username || "U").slice(0, 2).toUpperCase()
  const roundedAverage = Math.round(averageScore)
  const memberSinceText = React.useMemo(
    () => formatMemberSince(user.created_at),
    [user.created_at]
  )

  return (
    <div data-testid="profile-view" className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col justify-between gap-4 pt-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <Avatar className="size-14 border border-border">
              {user.avatar_url && (
                <AvatarImage src={user.avatar_url} alt={user.username} />
              )}
              <AvatarFallback className="text-base font-semibold text-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  @{user.username}
                </h2>
                {user.github_login ? (
                  <Badge variant="success" data-testid="profile-github-status">
                    <CheckCircle2 aria-hidden="true" />
                    <span>GitHub · @{user.github_login}</span>
                  </Badge>
                ) : (
                  <Badge variant="outline" data-testid="profile-github-status">
                    GitHub not linked
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Mail aria-hidden="true" className="size-3.5" />
                  <span>{user.email}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar aria-hidden="true" className="size-3.5" />
                  <span>Member since {memberSinceText}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!user.github_login && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/settings">Connect GitHub</Link>
              </Button>
            )}
            <Button variant="secondary" size="sm" asChild>
              <Link href="/stats">
                <span>Full Analytics</span>
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="gap-1">
            <CardDescription className="text-xs">Solved</CardDescription>
            <CardTitle className="font-pixel text-2xl tabular-nums">
              {totalSolved}
              <span className="font-sans text-sm font-normal text-muted-foreground">
                /{totalChallenges}
              </span>
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="gap-1">
            <CardDescription className="text-xs">Attempted</CardDescription>
            <CardTitle className="font-pixel text-2xl tabular-nums">
              {totalAttempted}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="gap-1">
            <CardDescription className="text-xs">Average Score</CardDescription>
            <CardTitle className="font-pixel text-2xl tabular-nums">
              {roundedAverage}%
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="gap-1">
            <CardDescription className="flex items-center gap-1 text-xs">
              <Flame aria-hidden="true" className="size-3.5 text-amber-500" />
              <span>Streak</span>
            </CardDescription>
            <CardTitle className="font-pixel text-2xl tabular-nums">
              {streakDays}
              <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
                {streakDays === 1 ? "day" : "days"}
              </span>
            </CardTitle>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {timezone}
            </p>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">
              Category Mastery Summary
            </CardTitle>
            <CardDescription className="text-xs">
              Public catalog mastery across vulnerability and defect domains.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/stats">
              <span>View breakdown</span>
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {masteryItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No category activity recorded yet. Start reviewing challenges in
              the catalog.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {masteryItems.map((item) => (
                <div
                  key={item.category}
                  className="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/20 p-3"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">
                      {item.category}
                    </span>
                    <span className="font-mono text-muted-foreground tabular-nums">
                      {item.solved}/{item.total} solved · {item.percentage}%
                    </span>
                  </div>
                  <Progress
                    value={item.percentage}
                    className="h-1.5 bg-muted"
                  />
                </div>
              ))}
            </div>
          )}

          {(customAttempted > 0 || customSolved > 0) && (
            <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground tabular-nums">
              Custom AI challenges: {customSolved} solved · {customAttempted}{" "}
              attempted
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function ProfileView() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()

  let body: React.ReactNode
  if (authLoading) {
    body = <ProfileSkeleton />
  } else if (!isAuthenticated || !user) {
    body = (
      <AccountAuthEmpty
        title="Sign in to view your profile"
        description="Create an account or sign in to view your reviewer profile, GitHub link status, and synced progress."
        showGuestStatsLink
      />
    )
  } else {
    body = <ProfileAuthenticatedContent user={user} />
  }

  return (
    <AccountShell
      title="Profile"
      description="Your Diffly reviewer identity, GitHub connection, and headline mastery."
    >
      {body}
    </AccountShell>
  )
}
