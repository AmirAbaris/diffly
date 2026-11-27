import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5] as const

export function LeaderboardSkeleton() {
  return (
    <div
      data-testid="leaderboard-loading"
      className="flex flex-col gap-6"
      aria-busy="true"
      aria-label="Loading leaderboard"
    >
      <Card size="sm">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-14" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3.5 w-48" />
            </div>
          </div>
          <Skeleton className="h-8 w-28" />
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <div className="hidden border-b border-border bg-muted/30 px-4 py-2.5 sm:grid sm:grid-cols-[3.5rem_minmax(0,1fr)_5.5rem_5.5rem_4.5rem_5.5rem] sm:gap-3">
          <Skeleton className="h-3.5 w-10" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="ml-auto h-3.5 w-12" />
          <Skeleton className="ml-auto h-3.5 w-12" />
          <Skeleton className="ml-auto h-3.5 w-10" />
          <Skeleton className="ml-auto h-3.5 w-14" />
        </div>
        <div className="divide-y divide-border/60">
          {SKELETON_ROWS.map((row) => (
            <div
              key={row}
              className="flex items-center justify-between gap-3 px-4 py-3 sm:grid sm:grid-cols-[3.5rem_minmax(0,1fr)_5.5rem_5.5rem_4.5rem_5.5rem]"
            >
              <Skeleton className="h-5 w-8" />
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <Skeleton className="size-7 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="ml-auto h-4 w-12" />
              <Skeleton className="ml-auto hidden h-4 w-12 sm:block" />
              <Skeleton className="ml-auto hidden h-4 w-8 sm:block" />
              <Skeleton className="ml-auto hidden h-4 w-12 sm:block" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
