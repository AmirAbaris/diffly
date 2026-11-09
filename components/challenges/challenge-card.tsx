"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileCode,
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
import { cn } from "@/lib/utils"
import type { ChallengeSummary, Difficulty, Language } from "@/types/challenge"

export interface ChallengeCardProps {
  challenge: ChallengeSummary
  className?: string
}

const DIFFICULTY_CONFIG: Record<
  Difficulty,
  {
    label: string
    badgeClasses: string
    dotClasses: string
  }
> = {
  Easy: {
    label: "Easy",
    badgeClasses:
      "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-300",
    dotClasses: "bg-emerald-500",
  },
  Medium: {
    label: "Medium",
    badgeClasses:
      "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-300",
    dotClasses: "bg-amber-500",
  },
  Hard: {
    label: "Hard",
    badgeClasses:
      "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/20 dark:text-rose-300",
    dotClasses: "bg-rose-500",
  },
}

const LANGUAGE_LABELS: Record<Language, string> = {
  python: "Python",
  typescript: "TypeScript",
}

function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.Easy

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", config.badgeClasses)}
      data-testid={`difficulty-badge-${difficulty.toLowerCase()}`}
    >
      <span
        className={cn("size-1.5 shrink-0 rounded-full", config.dotClasses)}
        aria-hidden="true"
      />
      <span>{config.label}</span>
    </Badge>
  )
}

function CompletionBadge({
  isSolved,
  bestScore,
}: {
  isSolved: boolean
  bestScore: number | null
}) {
  if (isSolved) {
    const scoreText =
      bestScore !== null ? `Solved (${bestScore}%)` : "Solved (100%)"
    return (
      <Badge
        variant="outline"
        className="gap-1 border-emerald-500/30 bg-emerald-500/15 font-mono text-xs font-semibold text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/25 dark:text-emerald-300"
        data-testid="completion-badge-solved"
      >
        <CheckCircle2
          className="size-3 text-emerald-600 dark:text-emerald-400"
          data-icon="inline-start"
        />
        <span>{scoreText}</span>
      </Badge>
    )
  }

  if (bestScore !== null) {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/30 bg-amber-500/15 font-mono text-xs font-semibold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/25 dark:text-amber-300"
        data-testid="completion-badge-attempted"
      >
        <span>Attempted ({bestScore}%)</span>
      </Badge>
    )
  }

  return null
}

export function ChallengeCard({ challenge, className }: ChallengeCardProps) {
  const router = useRouter()
  const challengeUrl = `/challenges/${challenge.slug}`

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        event.target === event.currentTarget &&
        (event.key === "Enter" || event.key === " ")
      ) {
        event.preventDefault()
        router.push(challengeUrl)
      }
    },
    [router, challengeUrl]
  )

  const languageLabel =
    LANGUAGE_LABELS[challenge.language] ?? challenge.language

  return (
    <Card
      role="article"
      tabIndex={0}
      aria-label={`Challenge: ${challenge.title}`}
      data-slot="challenge-card"
      data-testid={`challenge-card-${challenge.slug}`}
      onKeyDown={handleKeyDown}
      className={cn(
        "group flex flex-col justify-between transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        className
      )}
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <DifficultyBadge difficulty={challenge.difficulty} />
            <Badge variant="outline" className="text-muted-foreground">
              {challenge.category}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <CompletionBadge
              isSolved={challenge.is_solved}
              bestScore={challenge.best_score}
            />
            <Badge variant="outline" className="font-mono text-xs">
              {languageLabel}
            </Badge>
          </div>
        </div>

        <CardTitle className="line-clamp-1">
          <Link
            href={challengeUrl}
            className="hover:underline focus-visible:underline focus-visible:outline-none"
            tabIndex={-1}
            aria-hidden="true"
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
          <span
            className="flex items-center gap-1 font-mono"
            title="Estimated review time"
          >
            <Clock className="size-3.5 text-muted-foreground/80" />~
            {challenge.estimated_minutes} min
          </span>

          <span
            className="flex items-center gap-1 font-mono"
            title="Line count"
          >
            <FileCode className="size-3.5 text-muted-foreground/80" />
            {challenge.line_count} loc
          </span>

          <span
            className="flex items-center gap-1 font-mono"
            title="Available hints"
          >
            <Lightbulb className="size-3.5 text-muted-foreground/80" />
            {challenge.total_hints} hints
          </span>
        </div>
      </CardContent>

      <CardFooter>
        <Button asChild size="sm" className="w-full font-medium">
          <Link href={challengeUrl}>
            {challenge.is_solved ? "Review Again" : "Start Review"}
            <ArrowRight className="size-4" data-icon="inline-end" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
