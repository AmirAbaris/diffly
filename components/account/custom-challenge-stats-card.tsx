"use client"

import * as React from "react"
import Link from "next/link"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { CustomChallengeAnalytics } from "@/types/analytics"

export interface CustomChallengeStatsCardProps {
  custom: CustomChallengeAnalytics
}

export function CustomChallengeStatsCard({
  custom,
}: CustomChallengeStatsCardProps) {
  return (
    <Card data-testid="custom-challenge-stats-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            <span>Custom Challenges</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Tracked separately from public catalog mastery and precision/recall
            scores.
          </CardDescription>
        </div>

        <Button variant="outline" size="sm" asChild>
          <Link href="/challenges">Open Catalog</Link>
        </Button>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1 rounded-lg border border-border/70 bg-muted/20 p-3">
            <span className="text-xs text-muted-foreground">Attempted</span>
            <span className="font-pixel text-xl text-foreground tabular-nums">
              {custom.attempted}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border border-border/70 bg-muted/20 p-3">
            <span className="text-xs text-muted-foreground">Solved</span>
            <span className="font-pixel text-xl text-foreground tabular-nums">
              {custom.solved}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border border-border/70 bg-muted/20 p-3">
            <span className="text-xs text-muted-foreground">Submissions</span>
            <span className="font-pixel text-xl text-foreground tabular-nums">
              {custom.submissions}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
