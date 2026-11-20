"use client"

import * as React from "react"
import { TrendingUp } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import type { AnalyticsTrendPoint } from "@/types/analytics"

export interface PrecisionRecallChartProps {
  trends: AnalyticsTrendPoint[]
}

const CHART_WIDTH = 520
const CHART_HEIGHT = 200
const PAD_LEFT = 42
const PAD_RIGHT = 20
const PAD_TOP = 16
const PAD_BOTTOM = 28
const PLOT_WIDTH = CHART_WIDTH - PAD_LEFT - PAD_RIGHT
const PLOT_HEIGHT = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM
const Y_TICKS = [0, 25, 50, 75, 100] as const

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function toX(index: number, total: number): number {
  if (total <= 1) {
    return PAD_LEFT + PLOT_WIDTH / 2
  }
  return PAD_LEFT + (index / (total - 1)) * PLOT_WIDTH
}

function toY(pct: number): number {
  return PAD_TOP + ((100 - clampPct(pct)) / 100) * PLOT_HEIGHT
}

export function PrecisionRecallChart({ trends }: PrecisionRecallChartProps) {
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null)

  const plottedPoints = React.useMemo(
    () =>
      trends.map((point, index) => ({
        ...point,
        x: Math.round(toX(index, trends.length) * 10) / 10,
        precisionY: Math.round(toY(point.precision) * 10) / 10,
        recallY: Math.round(toY(point.recall) * 10) / 10,
      })),
    [trends]
  )

  const precisionPath = plottedPoints
    .map((pt) => `${pt.x},${pt.precisionY}`)
    .join(" ")
  const recallPath = plottedPoints
    .map((pt) => `${pt.x},${pt.recallY}`)
    .join(" ")

  const activePoint =
    activeIndex !== null && plottedPoints[activeIndex]
      ? plottedPoints[activeIndex]
      : (plottedPoints[plottedPoints.length - 1] ?? null)

  return (
    <Card data-testid="precision-recall-chart-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            <span>Precision vs. Recall Trend</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Daily precision (signal-to-noise) and recall (issue coverage) across
            catalog submissions.
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-4 rounded-full bg-emerald-500"
            />
            <span>Precision</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-4 border-b-2 border-dashed border-sky-500"
            />
            <span>Recall</span>
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {plottedPoints.length === 0 ? (
          <Empty
            data-testid="trends-empty-state"
            className="border border-border/60 py-8"
          >
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TrendingUp aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No trend data in this window</EmptyTitle>
              <EmptyDescription>
                Submit a review in the arena to plot precision and recall over
                time.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            {activePoint && (
              <div
                data-testid="trends-active-summary"
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-xs tabular-nums"
              >
                <span className="font-mono font-medium text-foreground">
                  {activePoint.date}
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    Precision: {Math.round(activePoint.precision)}%
                  </span>
                  <span className="text-sky-600 dark:text-sky-400">
                    Recall: {Math.round(activePoint.recall)}%
                  </span>
                  <span className="text-muted-foreground">
                    Avg: {Math.round(activePoint.average_score)}% (
                    {activePoint.submissions}{" "}
                    {activePoint.submissions === 1
                      ? "submission"
                      : "submissions"}
                    )
                  </span>
                </div>
              </div>
            )}

            <div className="w-full">
              <svg
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                role="img"
                aria-label="Precision and recall trend line chart"
                data-testid="precision-recall-svg"
                className="h-auto max-h-60 w-full"
              >
                {Y_TICKS.map((tick) => {
                  const y = toY(tick)
                  return (
                    <g key={tick}>
                      <line
                        x1={PAD_LEFT}
                        x2={CHART_WIDTH - PAD_RIGHT}
                        y1={y}
                        y2={y}
                        className="stroke-border/70"
                        strokeDasharray="3 3"
                        strokeWidth={1}
                      />
                      <text
                        x={PAD_LEFT - 6}
                        y={y + 4}
                        textAnchor="end"
                        className="fill-muted-foreground font-mono text-xs tabular-nums"
                      >
                        {tick}%
                      </text>
                    </g>
                  )
                })}

                {plottedPoints.length > 1 && (
                  <>
                    <polyline
                      fill="none"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={precisionPath}
                      className="stroke-emerald-500"
                    />
                    <polyline
                      fill="none"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={recallPath}
                      className="stroke-sky-500"
                    />
                  </>
                )}

                {plottedPoints.map((pt, index) => {
                  const isActive = activeIndex === index
                  return (
                    <g
                      key={pt.date}
                      onMouseEnter={() => setActiveIndex(index)}
                      className="cursor-pointer"
                    >
                      <circle
                        cx={pt.x}
                        cy={pt.precisionY}
                        r={isActive ? 6 : 5}
                        className="fill-emerald-500/25 stroke-emerald-500"
                        strokeWidth={2}
                      />
                      <circle
                        cx={pt.x}
                        cy={pt.recallY}
                        r={isActive ? 3.5 : 2.5}
                        className="fill-sky-500 stroke-background"
                        strokeWidth={1}
                      />
                    </g>
                  )
                })}

                {plottedPoints.length > 0 && (
                  <>
                    <text
                      x={plottedPoints[0].x}
                      y={CHART_HEIGHT - 6}
                      textAnchor={
                        plottedPoints.length === 1 ? "middle" : "start"
                      }
                      className="fill-muted-foreground font-mono text-xs"
                    >
                      {plottedPoints[0].date}
                    </text>
                    {plottedPoints.length > 1 && (
                      <text
                        x={plottedPoints[plottedPoints.length - 1].x}
                        y={CHART_HEIGHT - 6}
                        textAnchor="end"
                        className="fill-muted-foreground font-mono text-xs"
                      >
                        {plottedPoints[plottedPoints.length - 1].date}
                      </text>
                    )}
                  </>
                )}
              </svg>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
