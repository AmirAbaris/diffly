"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { DifficultyBadge } from "@/components/challenges/difficulty-badge"
import { NavStats } from "@/components/layout/nav-stats"
import { UserNav } from "@/components/layout/user-nav"
import { NextDrillButton } from "@/components/review/arena-header/next-drill-button"
import { TimedModeControl } from "@/components/review/arena-header/timed-mode-control"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useArenaUIStore } from "@/stores/arena-ui-store"
import type { ChallengeDetail } from "@/types/challenge"

export interface ArenaHeaderProps {
  challenge: ChallengeDetail
  onOpenHistory?: () => void
  attemptCount?: number
}

export function ArenaHeader({
  challenge,
  onOpenHistory,
  attemptCount = 0,
}: ArenaHeaderProps) {
  const setHistoryOpen = useArenaUIStore((s) => s.setIsHistoryOpen)
  const handleOpenHistory = onOpenHistory ?? (() => setHistoryOpen(true))

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden sm:gap-2.5">
        <Button
          asChild
          variant="ghost"
          size="sm"
          aria-label="Back to catalog"
          className="h-8 shrink-0 gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground sm:gap-1.5 sm:px-2"
        >
          <Link href="/challenges">
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            <span className="hidden font-medium sm:inline">Catalog</span>
          </Link>
        </Button>

        <span
          aria-hidden="true"
          className="hidden text-sm text-border select-none sm:inline"
        >
          /
        </span>

        <div className="flex min-w-0 items-center gap-2">
          <h1 className="hidden truncate text-sm font-semibold tracking-tight text-foreground sm:block">
            {challenge.title}
          </h1>
          <Badge variant="outline" className="hidden shrink-0 lg:inline-flex">
            {challenge.category}
          </Badge>
          <div className="hidden shrink-0 md:block">
            <DifficultyBadge difficulty={challenge.difficulty} />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {challenge.is_solved ? (
          <Badge variant="success">Solved</Badge>
        ) : challenge.best_score !== null ? (
          <Badge variant="warning" className="tabular-nums">
            <span className="sm:hidden">{challenge.best_score}%</span>
            <span className="hidden sm:inline">
              Best · {challenge.best_score}%
            </span>
          </Badge>
        ) : (
          <Badge variant="outline" className="hidden lg:inline-flex">
            In Review
          </Badge>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleOpenHistory}
          className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground sm:gap-1.5 sm:px-2.5"
          data-testid="history-drawer-trigger"
          aria-label="View past attempts"
        >
          <span className="hidden sm:inline">Attempts</span>
          <span className="sm:hidden">Log</span>
          {attemptCount > 0 && (
            <span className="font-mono font-semibold text-foreground tabular-nums">
              ({attemptCount})
            </span>
          )}
        </Button>

        <TimedModeControl />
        <NextDrillButton currentSlug={challenge.slug} />

        <div className="hidden h-4 w-px bg-border sm:block" />
        <div className="hidden items-center xl:flex">
          <NavStats />
        </div>
        <UserNav />
      </div>
    </header>
  )
}
