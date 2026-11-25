"use client"

import Link from "next/link"
import { AlertTriangle, ArrowRight } from "lucide-react"
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
import type { ConfigureChallengeOutput } from "@/lib/ai/coach"
import { formatLanguageLabel } from "@/types/challenge"

export function CoachChallengeConfigResolved({
  output,
}: {
  output: ConfigureChallengeOutput
}) {
  if (output.status === "cancelled") {
    return (
      <Card
        size="sm"
        data-testid="coach-config-cancelled"
        className="border-border/70 bg-muted/20 shadow-none"
      >
        <CardContent className="text-xs text-muted-foreground">
          <span>Challenge creation cancelled</span>
        </CardContent>
      </Card>
    )
  }

  if (output.status === "quota_full") {
    return (
      <Card
        size="sm"
        data-testid="coach-config-quota-full"
        className="border-amber-500/30 bg-amber-500/5 shadow-none"
      >
        <CardContent className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
          <AlertTriangle
            aria-hidden="true"
            className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
          />
          <span>
            Custom challenge library is full ({output.quotaLimit}/
            {output.quotaLimit}). Delete one in the sidebar to create another.
          </span>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      size="sm"
      data-testid="coach-config-created"
      className="border-border bg-card shadow-none"
    >
      <CardHeader className="gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="success" size="sm">
            Challenge Ready
          </Badge>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" size="sm" className="font-mono">
              {formatLanguageLabel(output.language)}
            </Badge>
            <Badge variant="outline" size="sm">
              {output.difficulty}
            </Badge>
          </div>
        </div>
        <CardTitle className="text-sm text-balance">{output.title}</CardTitle>
        <CardDescription className="text-xs text-pretty">
          {output.topic}
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button size="sm" asChild data-testid="coach-config-open-challenge">
          <Link href={`/challenges/${output.slug}`}>
            <span>Start Review in Arena</span>
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
