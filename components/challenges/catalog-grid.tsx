"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Inbox } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
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
    return <Badge variant="destructive">Hard</Badge>
  }

  if (difficulty === "Medium") {
    return <Badge variant="warning">Medium</Badge>
  }

  return <Badge variant="success">Easy</Badge>
}

function formatLanguageLabel(language: string): string {
  const norm = language.toLowerCase().trim()
  if (norm === "python") return "Python"
  if (norm === "typescript") return "TypeScript"
  if (norm === "go") return "Go"
  if (norm === "rust") return "Rust"
  return language
}

export function CatalogSkeletonGrid() {
  return (
    <div
      data-testid="catalog-skeleton"
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
    >
      {SKELETON_ITEMS.map((key) => (
        <Card key={key} className="justify-between">
          <CardHeader>
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-14" />
            </div>
            <Skeleton className="mt-1 h-5 w-4/5" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardHeader>
          <CardFooter className="justify-between border-t border-border/60 pt-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-20" />
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}

function EmptyStateCard({ onResetFilters }: { onResetFilters?: () => void }) {
  return (
    <Empty data-testid="catalog-empty-state" className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No matching challenges found</EmptyTitle>
        <EmptyDescription>
          No challenges match your active filters. Try searching for different
          keywords or clearing active filter criteria.
        </EmptyDescription>
      </EmptyHeader>
      {onResetFilters && (
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onResetFilters}>
            Reset filters
          </Button>
        </EmptyContent>
      )}
    </Empty>
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
          className="justify-between transition-colors hover:border-foreground/25"
        >
          <CardHeader className="gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <DifficultyBadge difficulty={challenge.difficulty} />
                <Badge variant="outline">{challenge.category}</Badge>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {challenge.is_solved && (
                  <Badge variant="success" className="tabular-nums">
                    {challenge.best_score !== null
                      ? `Solved · ${challenge.best_score}%`
                      : "Solved"}
                  </Badge>
                )}
                <Badge variant="secondary" className="font-mono">
                  {formatLanguageLabel(challenge.language)}
                </Badge>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <CardTitle className="line-clamp-1 text-base font-semibold tracking-tight">
                <Link
                  href={`/challenges/${challenge.slug}`}
                  className="hover:underline"
                >
                  {challenge.title}
                </Link>
              </CardTitle>

              <CardDescription className="line-clamp-2 text-xs leading-relaxed">
                {challenge.description}
              </CardDescription>
            </div>
          </CardHeader>

          <CardFooter className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
              <span>{challenge.estimated_minutes}m</span>
              <span aria-hidden="true">·</span>
              <span>{challenge.line_count} lines</span>
              <span aria-hidden="true">·</span>
              <span>{challenge.total_hints} hints</span>
            </div>

            <Button asChild variant="outline" size="sm" className="h-8 text-xs">
              <Link href={`/challenges/${challenge.slug}`}>
                <span>Review</span>
                <ArrowRight aria-hidden="true" data-icon="inline-end" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
