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
    return <Badge variant="default">Medium</Badge>
  }

  return <Badge variant="secondary">Easy</Badge>
}

export function CatalogSkeletonGrid() {
  return (
    <div
      data-testid="catalog-skeleton"
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
    >
      {SKELETON_ITEMS.map((key) => (
        <Card key={key}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-14" />
            </div>
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-4 w-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
          <CardFooter>
            <Skeleton className="h-9 w-full" />
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
          <Inbox />
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
        <Card key={challenge.id} className="justify-between">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <DifficultyBadge difficulty={challenge.difficulty} />
                <Badge variant="outline">{challenge.category}</Badge>
              </div>

              <div className="flex items-center gap-1.5">
                {challenge.is_solved && (
                  <Badge variant="secondary">
                    <CheckCircle2 data-icon="inline-start" />
                    {challenge.best_score !== null
                      ? `${challenge.best_score}%`
                      : "Solved"}
                  </Badge>
                )}
                <Badge variant="outline" className="uppercase">
                  {challenge.language}
                </Badge>
              </div>
            </div>

            <CardTitle className="line-clamp-1">
              <Link
                href={`/challenges/${challenge.slug}`}
                className="hover:underline"
              >
                {challenge.title}
              </Link>
            </CardTitle>

            <CardDescription className="line-clamp-2">
              {challenge.description}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" />
                {challenge.estimated_minutes} min
              </span>

              <span className="flex items-center gap-1">
                <FileCode className="size-3.5" />
                {challenge.line_count} lines
              </span>

              <span className="flex items-center gap-1">
                <Lightbulb className="size-3.5" />
                {challenge.total_hints} hints
              </span>
            </div>
          </CardContent>

          <CardFooter>
            <Button asChild size="sm" className="w-full">
              <Link href={`/challenges/${challenge.slug}`}>
                Review Challenge
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
