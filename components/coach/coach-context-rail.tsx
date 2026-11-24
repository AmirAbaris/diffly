"use client"

import * as React from "react"
import Link from "next/link"
import { AlertTriangle, ArrowUpRight, Target } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import type {
  CoachMissedSubmission,
  CoachPatternSlice,
  CoachPatternsSnapshot,
} from "@/lib/ai/coach"
import { formatLanguageLabel } from "@/types/challenge"

export interface CoachContextRailProps {
  patterns: CoachPatternsSnapshot | null
  isLoading: boolean
  disabled?: boolean
  onSelectPrompt: (prompt: string) => void
}

function WeakSliceCard({
  slice,
  disabled,
  onSelectPrompt,
}: {
  slice: CoachPatternSlice
  disabled: boolean
  onSelectPrompt: (prompt: string) => void
}) {
  const prompt = `Analyze my performance on ${slice.category} (${slice.language}, ${slice.difficulty}) where my average score is ${Math.round(slice.average_score)}%, precision is ${Math.round(slice.precision)}%, and recall is ${Math.round(slice.recall)}%. What pattern am I missing, and suggest a targeted drill.`

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelectPrompt(prompt)}
      className="flex w-full flex-col gap-1.5 rounded-lg border border-border/70 bg-card p-2.5 text-left transition-colors hover:border-border hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-foreground">
          {slice.category}
        </span>
        <span className="shrink-0 font-mono text-xs font-medium text-muted-foreground tabular-nums">
          {Math.round(slice.average_score)}%
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" size="sm" className="font-mono">
          {formatLanguageLabel(slice.language)}
        </Badge>
        <Badge variant="outline" size="sm">
          {slice.difficulty}
        </Badge>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
        <span>P {Math.round(slice.precision)}%</span>
        <span aria-hidden="true">·</span>
        <span>R {Math.round(slice.recall)}%</span>
      </div>
    </button>
  )
}

function MissedReviewRow({
  item,
  disabled,
  onSelectPrompt,
}: {
  item: CoachMissedSubmission
  disabled: boolean
  onSelectPrompt: (prompt: string) => void
}) {
  const prompt = `Break down my missed review on "${item.title}" (${item.category}, ${item.language}, score ${item.score}%, ${item.missed_line_count} missed lines, ${item.false_positive_count} false positives) and tell me what to look for next time.`

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelectPrompt(prompt)}
      className="flex w-full flex-col gap-1 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:border-border/70 hover:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-foreground">
          {item.title}
        </span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {item.score}%
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
        <span>{formatLanguageLabel(item.language)}</span>
        <span aria-hidden="true">·</span>
        <span>{item.missed_line_count} missed</span>
      </div>
    </button>
  )
}

function RailSkeleton() {
  return (
    <div
      data-testid="coach-context-rail-loading"
      className="flex flex-col gap-3 p-4"
    >
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-14 w-full rounded-lg" />
    </div>
  )
}

export function CoachContextRail({
  patterns,
  isLoading,
  disabled = false,
  onSelectPrompt,
}: CoachContextRailProps) {
  return (
    <aside
      aria-label="Review history context"
      data-testid="coach-context-rail"
      className="hidden w-72 shrink-0 flex-col border-r border-border bg-muted/15 lg:flex"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="text-xs font-semibold tracking-tight text-foreground">
          Review Context
        </span>
        <Link
          href="/stats"
          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span>Stats</span>
          <ArrowUpRight aria-hidden="true" className="size-3" />
        </Link>
      </div>
      <Separator />

      {isLoading && !patterns ? (
        <RailSkeleton />
      ) : !patterns || patterns.total_submissions === 0 ? (
        <div
          data-testid="coach-context-rail-empty"
          className="flex flex-1 flex-col gap-3 p-4"
        >
          <p className="text-xs leading-relaxed text-pretty text-muted-foreground">
            No graded reviews yet. Complete a challenge in the arena or ask
            Agent Coach for a starter practice drill.
          </p>
          <Link
            href="/challenges"
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-foreground underline underline-offset-4 hover:opacity-80"
          >
            <span>Browse Challenges</span>
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto overscroll-contain p-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-0.5 rounded-lg border border-border/70 bg-card px-3 py-2">
              <span className="text-xs text-muted-foreground">Submissions</span>
              <span className="font-pixel text-lg text-foreground tabular-nums">
                {patterns.total_submissions}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg border border-border/70 bg-card px-3 py-2">
              <span className="text-xs text-muted-foreground">Missed</span>
              <span className="font-pixel text-lg text-foreground tabular-nums">
                {patterns.total_missed_submissions}
              </span>
            </div>
          </div>

          {patterns.weakest_slices.length > 0 ? (
            <section className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Target aria-hidden="true" className="size-3.5" />
                <span>Weakest Patterns</span>
              </div>
              <div className="flex flex-col gap-2">
                {patterns.weakest_slices.map((slice) => (
                  <WeakSliceCard
                    key={`${slice.category}-${slice.language}-${slice.difficulty}`}
                    slice={slice}
                    disabled={disabled}
                    onSelectPrompt={onSelectPrompt}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {patterns.recent_missed.length > 0 ? (
            <section className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <AlertTriangle aria-hidden="true" className="size-3.5" />
                <span>Recent Missed Reviews</span>
              </div>
              <div className="flex flex-col gap-1">
                {patterns.recent_missed.map((item) => (
                  <MissedReviewRow
                    key={`${item.challenge_slug}-${item.submitted_at}`}
                    item={item}
                    disabled={disabled}
                    onSelectPrompt={onSelectPrompt}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </aside>
  )
}
