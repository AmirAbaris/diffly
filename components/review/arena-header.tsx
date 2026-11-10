"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, CircleDashed, History } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { NavStats } from "@/components/layout/nav-stats"
import { UserNav } from "@/components/layout/user-nav"
import { useArenaUIStore } from "@/stores/arena-ui-store"
import type { ChallengeDetail, Difficulty } from "@/types/challenge"

export interface ArenaHeaderProps {
  challenge?: ChallengeDetail | null
  isLoading?: boolean
  onOpenHistory?: () => void
  attemptCount?: number
}

function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  if (difficulty === "Hard") {
    return <Badge variant="destructive">Hard</Badge>
  }
  if (difficulty === "Medium") {
    return <Badge variant="default">Medium</Badge>
  }
  return <Badge variant="secondary">Easy</Badge>
}

export function ArenaHeader({
  challenge,
  isLoading,
  onOpenHistory,
  attemptCount = 0,
}: ArenaHeaderProps) {
  const setHistoryOpen = useArenaUIStore((s) => s.setIsHistoryOpen)
  const handleOpenHistory = onOpenHistory ?? (() => setHistoryOpen(true))
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/60 px-4 backdrop-blur-sm sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="gap-1.5 px-2 text-muted-foreground hover:text-foreground"
        >
          <Link href="/challenges">
            <ArrowLeft className="size-4" />
            <span className="font-medium">Catalog</span>
          </Link>
        </Button>

        <div className="h-4 w-px bg-border" />

        {isLoading || !challenge ? (
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-14" />
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">
              {challenge.title}
            </h1>
            <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
              {challenge.category}
            </Badge>
            <div className="shrink-0">
              <DifficultyBadge difficulty={challenge.difficulty} />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleOpenHistory}
          className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground sm:h-8"
          data-testid="history-drawer-trigger"
          aria-label="View past attempts"
        >
          <History className="size-3.5" />
          <span className="hidden sm:inline">Attempts</span>
          {attemptCount > 0 && (
            <Badge
              variant="secondary"
              className="h-4 px-1 text-[10px] font-bold"
            >
              {attemptCount}
            </Badge>
          )}
        </Button>

        {isLoading || !challenge ? (
          <Skeleton className="h-6 w-20" />
        ) : challenge.is_solved ? (
          <Badge
            variant="outline"
            className="gap-1 border-emerald-500/30 bg-emerald-500/10 font-medium text-emerald-600 dark:text-emerald-400"
          >
            <CheckCircle2 className="size-3" />
            Solved
          </Badge>
        ) : challenge.best_score !== null ? (
          <Badge
            variant="outline"
            className="gap-1 border-amber-500/30 bg-amber-500/10 font-medium text-amber-600 dark:text-amber-400"
          >
            <CircleDashed className="size-3" />
            Best: {challenge.best_score}%
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="gap-1 font-medium text-muted-foreground"
          >
            <CircleDashed className="size-3" />
            In Review
          </Badge>
        )}

        <div className="hidden h-4 w-px bg-border sm:block" />
        <div className="hidden items-center lg:flex">
          <NavStats />
        </div>
        <UserNav />
      </div>
    </header>
  )
}
