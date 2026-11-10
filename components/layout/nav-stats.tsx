"use client"

import * as React from "react"
import { CheckCircle2, Percent, Trophy, ChevronDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useUserStats } from "@/hooks/use-user-stats"
import { useAnimatedNumber } from "@/hooks/use-animated-number"
import { cn } from "@/lib/utils"

export interface NavStatsProps {
  className?: string
  compactOnMobile?: boolean
}

export function NavStats({ className, compactOnMobile = true }: NavStatsProps) {
  const {
    stats,
    isLoading,
    totalSolved,
    totalChallenges,
    averageScore,
    streakDays,
    categories,
  } = useUserStats()

  const [isOpen, setIsOpen] = React.useState(false)

  // Smooth counter animations
  const animatedSolved = useAnimatedNumber(totalSolved)
  const animatedScore = useAnimatedNumber(Math.round(averageScore))
  const animatedStreak = useAnimatedNumber(streakDays)

  if (isLoading && !stats) {
    return (
      <div
        data-testid="nav-stats-loading"
        className={cn("flex items-center gap-1.5 sm:gap-2", className)}
      >
        <Skeleton className="h-7 w-20 rounded-full sm:w-24" />
        <Skeleton className="h-7 w-16 rounded-full sm:w-24" />
        <Skeleton className="h-7 w-16 rounded-full sm:w-24" />
      </div>
    )
  }

  const streakUnit = animatedStreak === 1 ? "day" : "days"

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="nav-stats-trigger"
          aria-label="View performance metrics and category mastery"
          className={cn(
            "group inline-flex items-center gap-1.5 rounded-full p-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none sm:gap-2",
            className
          )}
        >
          {/* Solved Badge */}
          <Badge
            variant="outline"
            className="cursor-pointer gap-1 border-border/80 bg-background/50 px-2 py-0.5 text-xs font-medium text-foreground transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 hover:text-primary sm:px-2.5 sm:py-1"
          >
            <CheckCircle2 className="size-3 text-emerald-500" />
            <span className={cn(compactOnMobile && "hidden sm:inline")}>
              Solved:{" "}
            </span>
            <span className="font-semibold tabular-nums">
              {animatedSolved}/{totalChallenges}
            </span>
          </Badge>

          {/* Accuracy Badge */}
          <Badge
            variant="outline"
            className="cursor-pointer gap-1 border-border/80 bg-background/50 px-2 py-0.5 text-xs font-medium text-foreground transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 hover:text-primary sm:px-2.5 sm:py-1"
          >
            <Percent className="size-3 text-sky-500" />
            <span className={cn(compactOnMobile && "hidden sm:inline")}>
              Accuracy:{" "}
            </span>
            <span className="font-semibold tabular-nums">{animatedScore}%</span>
          </Badge>

          {/* Streak Badge */}
          <Badge
            variant="outline"
            className="cursor-pointer gap-1 border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 transition-colors duration-200 hover:border-amber-500/50 hover:bg-amber-500/20 sm:px-2.5 sm:py-1 dark:text-amber-400"
          >
            <span className="text-xs">🔥</span>
            <span className={cn(compactOnMobile && "hidden sm:inline")}>
              Streak:{" "}
            </span>
            <span className="font-semibold tabular-nums">
              {animatedStreak}
              <span className={cn(compactOnMobile && "sm:hidden")}>d</span>
              <span className={cn(compactOnMobile && "hidden sm:inline")}>
                {" "}
                {streakUnit}
              </span>
            </span>
          </Badge>

          <ChevronDown className="hidden size-3 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180 sm:inline-block" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-4 text-card-foreground shadow-lg sm:w-96"
      >
        <div className="flex flex-col gap-3.5">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Trophy className="size-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold tracking-tight">
                  Review Performance
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  Mastery breakdown across arena challenges
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="text-[10px] font-semibold">
              Live Stats
            </Badge>
          </div>

          {/* Quick Metrics Summary */}
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2.5 text-center">
            <div className="space-y-0.5">
              <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                Solved
              </span>
              <p className="text-sm font-bold text-foreground tabular-nums">
                {animatedSolved} / {totalChallenges}
              </p>
            </div>
            <div className="space-y-0.5 border-x border-border/60">
              <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                Accuracy
              </span>
              <p className="text-sm font-bold text-foreground tabular-nums">
                {animatedScore}%
              </p>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                Streak
              </span>
              <p className="text-sm font-bold text-amber-600 tabular-nums dark:text-amber-400">
                🔥 {animatedStreak} {animatedStreak === 1 ? "day" : "days"}
              </p>
            </div>
          </div>

          {/* Category Mastery Breakdown */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Category Mastery
              </span>
              <span className="text-[10px] text-muted-foreground">
                Best score avg
              </span>
            </div>

            {categories.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">
                No challenges available yet.
              </p>
            ) : (
              <div className="space-y-2.5">
                {categories.map((cat) => {
                  const accuracyPct = Math.round(cat.accuracy)
                  return (
                    <div key={cat.category} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">
                          {cat.category}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">
                            {cat.solved}/{cat.total} solved
                          </span>
                          <span
                            className={cn(
                              "font-bold tabular-nums",
                              accuracyPct >= 80
                                ? "text-emerald-600 dark:text-emerald-400"
                                : accuracyPct >= 50
                                  ? "text-sky-600 dark:text-sky-400"
                                  : "text-muted-foreground"
                            )}
                          >
                            {accuracyPct}%
                          </span>
                        </div>
                      </div>
                      <Progress
                        value={accuracyPct}
                        className="h-1.5 bg-muted"
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
