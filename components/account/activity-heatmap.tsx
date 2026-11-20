"use client"

import * as React from "react"
import { Flame } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { ActivityDay } from "@/types/analytics"

export interface ActivityHeatmapProps {
  activity: ActivityDay[]
  timezone: string
  days: number
  streakDays: number
  longestStreakDays: number
}

function getIntensityClass(count: number): string {
  if (count <= 0) return "bg-muted/60 border-border/50"
  if (count === 1) return "bg-emerald-500/25 border-emerald-500/30"
  if (count === 2) return "bg-emerald-500/50 border-emerald-500/40"
  if (count <= 4) return "bg-emerald-500/75 border-emerald-500/60"
  return "bg-emerald-500 border-emerald-500"
}

function getWeekdayOffset(isoDate: string): number {
  const parsed = new Date(`${isoDate}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return 0
  return parsed.getUTCDay()
}

export function ActivityHeatmap({
  activity,
  timezone,
  days,
  streakDays,
  longestStreakDays,
}: ActivityHeatmapProps) {
  const [hoveredDay, setHoveredDay] = React.useState<ActivityDay | null>(null)

  const leadingPadding =
    activity.length > 0 ? getWeekdayOffset(activity[0].date) : 0
  const padItems = React.useMemo(
    () => Array.from({ length: leadingPadding }, (_, idx) => `pad-${idx}`),
    [leadingPadding]
  )

  return (
    <Card data-testid="activity-heatmap-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Flame aria-hidden="true" className="size-4 text-amber-500" />
            <span>Streak Calendar</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Daily submission activity over the last {days} days in{" "}
            <span className="font-mono text-foreground">{timezone}</span>.
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="tabular-nums">
            Current: {streakDays} {streakDays === 1 ? "day" : "days"}
          </Badge>
          <Badge variant="secondary" className="tabular-nums">
            Longest: {longestStreakDays}{" "}
            {longestStreakDays === 1 ? "day" : "days"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {activity.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No activity calendar data available for this window.
          </p>
        ) : (
          <div className="overflow-x-auto pb-1">
            <div
              role="group"
              aria-label={`Activity heatmap for last ${days} days`}
              data-testid="activity-heatmap-grid"
              className="grid w-max grid-flow-col grid-rows-7 gap-1"
            >
              {padItems.map((padKey) => (
                <div key={padKey} aria-hidden="true" className="size-3" />
              ))}

              {activity.map((day, index) => {
                const submissionLabel =
                  day.count === 1 ? "1 submission" : `${day.count} submissions`
                const label = `${day.date}: ${submissionLabel}`
                const isLast = index === activity.length - 1
                return (
                  <button
                    key={day.date}
                    type="button"
                    tabIndex={isLast ? 0 : -1}
                    aria-label={label}
                    title={label}
                    data-date={day.date}
                    data-count={day.count}
                    onMouseEnter={() => setHoveredDay(day)}
                    onMouseLeave={() => setHoveredDay(null)}
                    onFocus={() => setHoveredDay(day)}
                    onBlur={() => setHoveredDay(null)}
                    className={cn(
                      "size-3 rounded-[2px] border transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      getIntensityClass(day.count)
                    )}
                  />
                )
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="min-h-4 font-mono tabular-nums">
            {hoveredDay
              ? `${hoveredDay.date} · ${hoveredDay.count} ${hoveredDay.count === 1 ? "submission" : "submissions"}`
              : "Hover a day to inspect submissions"}
          </span>

          <div className="flex items-center gap-1.5">
            <span>Less</span>
            <span
              aria-hidden="true"
              className="size-2.5 rounded-[2px] border border-border/50 bg-muted/60"
            />
            <span
              aria-hidden="true"
              className="size-2.5 rounded-[2px] border border-emerald-500/30 bg-emerald-500/25"
            />
            <span
              aria-hidden="true"
              className="size-2.5 rounded-[2px] border border-emerald-500/40 bg-emerald-500/50"
            />
            <span
              aria-hidden="true"
              className="size-2.5 rounded-[2px] border border-emerald-500/60 bg-emerald-500/75"
            />
            <span
              aria-hidden="true"
              className="size-2.5 rounded-[2px] border border-emerald-500 bg-emerald-500"
            />
            <span>More</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
