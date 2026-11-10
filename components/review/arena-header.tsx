"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
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
    return <Badge variant="warning">Medium</Badge>
  }
  return <Badge variant="success">Easy</Badge>
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
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Link href="/challenges">
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            <span className="font-medium">Catalog</span>
          </Link>
        </Button>

        <span aria-hidden="true" className="text-sm text-border select-none">
          /
        </span>

        {isLoading || !challenge ? (
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-14" />
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">
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

      <div className="flex shrink-0 items-center gap-2">
        {isLoading || !challenge ? (
          <Skeleton className="h-5 w-20" />
        ) : challenge.is_solved ? (
          <Badge variant="success">Solved</Badge>
        ) : challenge.best_score !== null ? (
          <Badge variant="warning" className="tabular-nums">
            Best · {challenge.best_score}%
          </Badge>
        ) : (
          <Badge variant="outline" className="hidden sm:inline-flex">
            In Review
          </Badge>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleOpenHistory}
          className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
          data-testid="history-drawer-trigger"
          aria-label="View past attempts"
        >
          <span>Attempts</span>
          {attemptCount > 0 && (
            <span className="font-mono font-semibold text-foreground tabular-nums">
              ({attemptCount})
            </span>
          )}
        </Button>

        <div className="hidden h-4 w-px bg-border sm:block" />
        <div className="hidden items-center xl:flex">
          <NavStats />
        </div>
        <UserNav />
      </div>
    </header>
  )
}
