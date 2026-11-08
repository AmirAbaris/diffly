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
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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

function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  if (difficulty === "Hard") {
    return (
      <Badge variant="destructive" className="gap-1 font-medium">
        <span className="size-1.5 rounded-full bg-rose-500" />
        Hard
      </Badge>
    )
  }

  if (difficulty === "Medium") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-500/40 font-medium text-amber-700 dark:text-amber-400"
      >
        <span className="size-1.5 rounded-full bg-amber-500" />
        Medium
      </Badge>
    )
  }

  return (
    <Badge
      variant="outline"
      className="gap-1 border-emerald-500/40 font-medium text-emerald-700 dark:text-emerald-400"
    >
      <span className="size-1.5 rounded-full bg-emerald-500" />
      Easy
    </Badge>
  )
}

function CatalogSkeletonGrid() {
  return (
    <div
      data-testid="catalog-skeleton"
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
    >
      {SKELETON_ITEMS.map((key) => (
        <Card key={key} className="flex flex-col justify-between">
          <CardHeader className="gap-2">
            <div className="flex items-center justify-between">
              <div className="bg-muted h-5 w-16 animate-pulse rounded-full" />
              <div className="bg-muted h-5 w-14 animate-pulse rounded-full" />
            </div>
            <div className="bg-muted h-5 w-4/5 animate-pulse rounded" />
            <div className="bg-muted h-4 w-full animate-pulse rounded" />
          </CardHeader>
          <CardContent>
            <div className="bg-muted h-3.5 w-2/3 animate-pulse rounded" />
          </CardContent>
          <CardFooter>
            <div className="bg-muted h-8 w-full animate-pulse rounded-4xl" />
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}

function EmptyStateCard({ onResetFilters }: { onResetFilters?: () => void }) {
  return (
    <Card
      data-testid="catalog-empty-state"
      className="flex flex-col items-center justify-center p-8 text-center"
    >
      <div className="bg-muted mb-3 flex size-12 items-center justify-center rounded-full">
        <Inbox className="text-muted-foreground size-6" />
      </div>

      <CardTitle className="text-base">No matching challenges found</CardTitle>

      <CardDescription className="mt-1 max-w-sm text-xs">
        No challenges match your active filters. Try searching for different
        keywords or clearing active filter criteria.
      </CardDescription>

      {onResetFilters && (
        <Button
          variant="outline"
          size="sm"
          onClick={onResetFilters}
          className="mt-4"
        >
          Reset filters
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
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
    >
      {challenges.map((challenge) => (
        <Card
          key={challenge.id}
          className="group/card hover:border-foreground/20 flex flex-col justify-between transition-colors"
        >
          <CardHeader className="gap-2 pb-3">
            {/* Badges row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <DifficultyBadge difficulty={challenge.difficulty} />
                <Badge
                  variant="outline"
                  className="text-muted-foreground text-[11px] font-normal"
                >
                  {challenge.category}
                </Badge>
              </div>

              <div className="flex items-center gap-1">
                {challenge.is_solved && (
                  <Badge
                    variant="secondary"
                    className="gap-1 text-[10px] text-emerald-700 dark:text-emerald-400"
                  >
                    <CheckCircle2 className="size-3" />
                    {challenge.best_score !== null
                      ? `${challenge.best_score}%`
                      : "Solved"}
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className="text-muted-foreground font-mono text-[10px] uppercase"
                >
                  {challenge.language}
                </Badge>
              </div>
            </div>

            {/* Title & Description */}
            <CardTitle className="line-clamp-1 text-base">
              <Link
                href={`/challenges/${challenge.slug}`}
                className="hover:underline focus-visible:outline-none"
              >
                {challenge.title}
              </Link>
            </CardTitle>

            <CardDescription className="line-clamp-2 text-xs">
              {challenge.description}
            </CardDescription>
          </CardHeader>

          {/* Metadata */}
          <CardContent className="py-0">
            <div className="text-muted-foreground flex items-center justify-between text-xs">
              <span
                className="flex items-center gap-1"
                title="Estimated duration"
              >
                <Clock className="size-3.5" />
                {challenge.estimated_minutes} min
              </span>

              <span
                className="flex items-center gap-1"
                title="Code snippet lines"
              >
                <FileCode className="size-3.5" />
                {challenge.line_count} lines
              </span>

              <span
                className="flex items-center gap-1"
                title="Progressive hints"
              >
                <Lightbulb className="size-3.5" />
                {challenge.total_hints} hints
              </span>
            </div>
          </CardContent>

          {/* Action button */}
          <CardFooter className="pt-3">
            <Button asChild size="sm" className="w-full gap-1.5">
              <Link href={`/challenges/${challenge.slug}`}>
                <span>Review Challenge</span>
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
