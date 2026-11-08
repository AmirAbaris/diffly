"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileCode,
  Inbox,
  Lightbulb,
  RotateCcw,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { ChallengeSummary, Difficulty } from "@/types/challenge"

export interface CatalogGridProps {
  challenges: ChallengeSummary[]
  isLoading: boolean
  onResetFilters?: () => void
}

const SKELETON_ITEMS = [
  "sk-card-1",
  "sk-card-2",
  "sk-card-3",
  "sk-card-4",
  "sk-card-5",
  "sk-card-6",
]

function getDifficultyBadgeStyles(difficulty: Difficulty): {
  className: string
  label: string
} {
  switch (difficulty) {
    case "Easy":
      return {
        className:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 dark:bg-emerald-500/20 font-medium",
        label: "Easy",
      }
    case "Medium":
      return {
        className:
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 dark:bg-amber-500/20 font-medium",
        label: "Medium",
      }
    case "Hard":
      return {
        className:
          "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400 dark:bg-rose-500/20 font-medium",
        label: "Hard",
      }
    default:
      return {
        className: "border-border bg-muted text-muted-foreground",
        label: difficulty,
      }
  }
}

function CatalogSkeletonGrid() {
  return (
    <div
      data-testid="catalog-skeleton"
      className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3"
    >
      {SKELETON_ITEMS.map((key) => (
        <Card
          key={key}
          className="bg-card/60 flex h-full flex-col justify-between border-dashed p-5"
        >
          <div className="space-y-3">
            {/* Badges row skeleton */}
            <div className="flex items-center justify-between">
              <div className="bg-muted h-5 w-16 animate-pulse rounded-full" />
              <div className="bg-muted h-5 w-20 animate-pulse rounded-full" />
            </div>

            {/* Title skeleton */}
            <div className="space-y-1.5 pt-1">
              <div className="bg-muted h-5 w-4/5 animate-pulse rounded-md" />
              <div className="bg-muted h-4 w-2/3 animate-pulse rounded-md" />
            </div>

            {/* Description skeleton */}
            <div className="space-y-1.5 pt-2">
              <div className="bg-muted/70 h-3.5 w-full animate-pulse rounded-sm" />
              <div className="bg-muted/70 h-3.5 w-11/12 animate-pulse rounded-sm" />
              <div className="bg-muted/70 h-3.5 w-4/5 animate-pulse rounded-sm" />
            </div>
          </div>

          <div className="space-y-3 pt-5">
            {/* Metadata row skeleton */}
            <div className="flex items-center justify-between border-t pt-3">
              <div className="bg-muted h-4 w-14 animate-pulse rounded-sm" />
              <div className="bg-muted h-4 w-14 animate-pulse rounded-sm" />
              <div className="bg-muted h-4 w-14 animate-pulse rounded-sm" />
            </div>

            {/* Button skeleton */}
            <div className="bg-muted h-9 w-full animate-pulse rounded-xl" />
          </div>
        </Card>
      ))}
    </div>
  )
}

function EmptyStateCard({ onResetFilters }: { onResetFilters?: () => void }) {
  return (
    <Card
      data-testid="catalog-empty-state"
      className="border-border/80 bg-card/40 flex flex-col items-center justify-center p-10 text-center"
    >
      <div className="bg-muted/60 ring-border mb-4 flex size-14 items-center justify-center rounded-2xl ring-1">
        <Inbox className="text-muted-foreground size-7" />
      </div>

      <h3 className="text-foreground text-lg font-semibold tracking-tight">
        No matching challenges found
      </h3>

      <p className="text-muted-foreground mt-1.5 max-w-md text-sm leading-relaxed">
        We couldn&apos;t find any challenges matching your active filters. Try
        loosening your search keywords or clearing difficulty and category
        filters.
      </p>

      {onResetFilters && (
        <Button
          variant="outline"
          size="sm"
          onClick={onResetFilters}
          className="mt-5 gap-2 rounded-xl"
        >
          <RotateCcw className="size-3.5" />
          Reset all filters
        </Button>
      )}
    </Card>
  )
}

export function CatalogGrid({
  challenges,
  isLoading,
  onResetFilters,
}: CatalogGridProps) {
  if (isLoading) {
    return <CatalogSkeletonGrid />
  }

  if (challenges.length === 0) {
    return <EmptyStateCard onResetFilters={onResetFilters} />
  }

  return (
    <div
      data-testid="catalog-grid"
      className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3"
    >
      {challenges.map((challenge) => {
        const difficultyBadge = getDifficultyBadgeStyles(challenge.difficulty)

        return (
          <Card
            key={challenge.id}
            className="group/item border-border/80 bg-card hover:border-primary/50 relative flex h-full flex-col justify-between transition-all duration-200 hover:shadow-md"
          >
            <div>
              <CardHeader className="gap-2.5 pb-2">
                {/* Badges Header */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs font-semibold",
                        difficultyBadge.className
                      )}
                    >
                      {difficultyBadge.label}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-muted-foreground border-border/70 text-[11px] font-normal"
                    >
                      {challenge.category}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-1">
                    {challenge.is_solved && (
                      <Badge
                        variant="secondary"
                        className="gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400"
                      >
                        <CheckCircle2 className="size-3" />
                        {challenge.best_score !== null
                          ? `${challenge.best_score}%`
                          : "Solved"}
                      </Badge>
                    )}
                    <Badge
                      variant="secondary"
                      className="text-muted-foreground font-mono text-[10px] uppercase"
                    >
                      {challenge.language}
                    </Badge>
                  </div>
                </div>

                {/* Challenge Title */}
                <h3 className="group-hover/item:text-primary text-base font-semibold tracking-tight transition-colors">
                  <Link
                    href={`/challenges/${challenge.slug}`}
                    className="focus-visible:ring-ring rounded-sm outline-none focus-visible:ring-2"
                  >
                    {challenge.title}
                  </Link>
                </h3>
              </CardHeader>

              {/* Description */}
              <CardContent className="pt-0 pb-3">
                <p className="text-muted-foreground line-clamp-3 text-xs leading-relaxed">
                  {challenge.description}
                </p>
              </CardContent>
            </div>

            {/* Footer with Metadata & Action */}
            <CardFooter className="flex-col gap-3 border-t pt-3 pb-4">
              <div className="text-muted-foreground flex w-full items-center justify-between text-xs">
                <div
                  className="flex items-center gap-1"
                  title="Estimated time to complete"
                >
                  <Clock className="size-3.5" />
                  <span>{challenge.estimated_minutes} min</span>
                </div>

                <div
                  className="flex items-center gap-1"
                  title="Code snippet line count"
                >
                  <FileCode className="size-3.5" />
                  <span>{challenge.line_count} lines</span>
                </div>

                <div
                  className="flex items-center gap-1"
                  title="Tiered hints available"
                >
                  <Lightbulb className="size-3.5" />
                  <span>{challenge.total_hints} hints</span>
                </div>
              </div>

              <Button
                asChild
                variant="default"
                size="sm"
                className="w-full gap-2 rounded-xl font-medium"
              >
                <Link href={`/challenges/${challenge.slug}`}>
                  <span>Review Code</span>
                  <ArrowRight className="size-3.5 transition-transform group-hover/item:translate-x-0.5" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}
