"use client"

import * as React from "react"
import { Inbox } from "lucide-react"
import { ChallengeCard } from "@/components/challenges/challenge-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import type { ChallengeSummary } from "@/types/challenge"

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
        <ChallengeCard key={challenge.id} challenge={challenge} />
      ))}
    </div>
  )
}
