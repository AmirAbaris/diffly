"use client"

import * as React from "react"
import { Layers } from "lucide-react"
import { Badge } from "@/components/ui/badge"
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
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import type { CategoryMastery } from "@/types/analytics"

export interface CategoryMasteryCardProps {
  categories: CategoryMastery[]
}

export function CategoryMasteryCard({ categories }: CategoryMasteryCardProps) {
  return (
    <Card data-testid="category-mastery-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers aria-hidden="true" className="size-4 text-muted-foreground" />
          <span>Category Mastery Breakdown</span>
        </CardTitle>
        <CardDescription className="text-xs">
          Mastery, precision, and recall computed across public catalog
          challenges.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {categories.length === 0 ? (
          <Empty className="border border-border/60 py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Layers aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No category data yet</EmptyTitle>
              <EmptyDescription>
                Attempt challenges across categories to track domain mastery.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-4">
            {categories.map((cat) => {
              const masteryPct = Math.round(cat.mastery)
              const precisionPct = Math.round(cat.precision)
              const recallPct = Math.round(cat.recall)

              return (
                <div
                  key={cat.category}
                  data-testid={`category-mastery-row-${cat.category}`}
                  className="flex flex-col gap-2.5 rounded-lg border border-border/70 bg-muted/20 p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {cat.category}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {cat.solved}/{cat.total} solved · {cat.attempted}{" "}
                        attempted
                      </span>
                    </div>

                    <span
                      className={cn(
                        "font-mono text-sm font-semibold tabular-nums",
                        masteryPct >= 80
                          ? "text-emerald-600 dark:text-emerald-400"
                          : masteryPct >= 50
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-foreground"
                      )}
                    >
                      {masteryPct}% mastery
                    </span>
                  </div>

                  <Progress value={masteryPct} className="h-1.5 bg-muted" />

                  <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
                    <Badge variant="outline" size="sm">
                      Precision: {precisionPct}%
                    </Badge>
                    <Badge variant="outline" size="sm">
                      Recall: {recallPct}%
                    </Badge>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
