"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
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
        className={cn("flex items-center", className)}
      >
        <Skeleton className="h-8 w-44 rounded-md sm:w-60" />
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
            "group inline-flex h-8 items-center gap-2 rounded-md border border-border bg-muted/20 pr-2 pl-2.5 text-xs transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:gap-2.5 sm:pr-2.5 sm:pl-3",
            className
          )}
        >
          {/* Solved Segment */}
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-emerald-500"
            />
            <span
              className={cn(
                "text-muted-foreground",
                compactOnMobile && "hidden sm:inline"
              )}
            >
              Solved
            </span>
            <span className="font-medium text-foreground tabular-nums">
              {animatedSolved}/{totalChallenges}
            </span>
          </span>

          <span aria-hidden="true" className="h-3.5 w-px bg-border" />

          {/* Accuracy Segment */}
          <span className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                "text-muted-foreground",
                compactOnMobile && "hidden sm:inline"
              )}
            >
              Accuracy
            </span>
            <span className="font-medium text-foreground tabular-nums">
              {animatedScore}%
            </span>
          </span>

          <span aria-hidden="true" className="h-3.5 w-px bg-border" />

          {/* Streak Segment */}
          <span className="inline-flex items-center gap-1">
            <span
              className={cn(
                "text-muted-foreground",
                compactOnMobile && "hidden sm:inline"
              )}
            >
              Streak
            </span>
            <span className="font-medium text-foreground tabular-nums">
              {animatedStreak}
              <span className={cn(compactOnMobile && "sm:hidden")}>d</span>
              <span className={cn(compactOnMobile && "hidden sm:inline")}>
                {" "}
                {streakUnit}
              </span>
            </span>
          </span>

          <ChevronDown
            aria-hidden="true"
            className="size-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-4 text-card-foreground sm:w-96"
      >
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex flex-col gap-0.5 border-b border-border pb-3">
            <h4 className="text-sm font-semibold tracking-tight text-foreground">
              Review Performance
            </h4>
            <p className="text-xs text-muted-foreground">
              Mastery breakdown across arena challenges
            </p>
          </div>

          {/* Quick Metrics Summary */}
          <div className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-muted/20 py-2.5 text-center">
            <div className="flex flex-col gap-0.5 px-2">
              <span className="text-xs text-muted-foreground">Solved</span>
              <p className="text-sm font-semibold text-foreground tabular-nums">
                {animatedSolved} / {totalChallenges}
              </p>
            </div>
            <div className="flex flex-col gap-0.5 px-2">
              <span className="text-xs text-muted-foreground">Accuracy</span>
              <p className="text-sm font-semibold text-foreground tabular-nums">
                {animatedScore}%
              </p>
            </div>
            <div className="flex flex-col gap-0.5 px-2">
              <span className="text-xs text-muted-foreground">Streak</span>
              <p className="text-sm font-semibold text-foreground tabular-nums">
                {animatedStreak} {animatedStreak === 1 ? "day" : "days"}
              </p>
            </div>
          </div>

          {/* Category Mastery Breakdown */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Category Mastery
              </span>
              <span className="text-xs text-muted-foreground">
                Best score avg
              </span>
            </div>

            {categories.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">
                No challenges available yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {categories.map((cat) => {
                  const accuracyPct = Math.round(cat.accuracy)
                  return (
                    <div key={cat.category} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">
                          {cat.category}
                        </span>
                        <div className="flex items-center gap-2 tabular-nums">
                          <span className="text-xs text-muted-foreground">
                            {cat.solved}/{cat.total} solved
                          </span>
                          <span
                            className={cn(
                              "font-semibold",
                              accuracyPct >= 80
                                ? "text-emerald-600 dark:text-emerald-400"
                                : accuracyPct >= 50
                                  ? "text-foreground"
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
