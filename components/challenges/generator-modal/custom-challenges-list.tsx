"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Inbox, Loader2, Trash2 } from "lucide-react"
import { DifficultyBadge } from "@/components/challenges/catalog-grid"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { toast } from "@/hooks/use-toast"
import { formatLanguageLabel, type ChallengeSummary } from "@/types/challenge"

export interface CustomChallengesListProps {
  challenges: ChallengeSummary[]
  isLoading: boolean
  onDelete: (id: number | string) => Promise<unknown>
  onSwitchToGenerate: () => void
  onCloseModal?: () => void
}

export function CustomChallengesList({
  challenges,
  isLoading,
  onDelete,
  onSwitchToGenerate,
  onCloseModal,
}: CustomChallengesListProps) {
  const [deletingId, setDeletingId] = React.useState<number | string | null>(
    null
  )

  const handleDelete = async (challenge: ChallengeSummary) => {
    try {
      setDeletingId(challenge.id)
      await onDelete(challenge.id)
      toast({
        title: "Challenge deleted",
        description: `"${challenge.title}" was removed. You freed 1 custom challenge slot.`,
        variant: "default",
      })
    } catch {
      toast({
        title: "Deletion failed",
        description: "Could not delete this challenge. Please try again.",
        variant: "destructive",
      })
    } finally {
      setDeletingId(null)
    }
  }

  if (isLoading && challenges.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
        <Loader2
          aria-hidden="true"
          className="size-4 animate-spin motion-reduce:animate-none"
        />
        <span>Loading your custom challenges…</span>
      </div>
    )
  }

  if (challenges.length === 0) {
    return (
      <Empty data-testid="custom-challenges-empty" className="border py-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Inbox aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No custom challenges yet</EmptyTitle>
          <EmptyDescription>
            You have 5 available custom slots. Generate your first personalized
            code review challenge using Gemini.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            size="sm"
            onClick={onSwitchToGenerate}
            data-testid="create-first-challenge-btn"
          >
            Create Your First Challenge
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-3" data-testid="custom-challenges-list">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">
          Your Private Library ({challenges.length}/5)
        </span>
        <span>Click to review or delete to free quota</span>
      </div>

      <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto pr-1">
        {challenges.map((ch) => {
          const isDeleting = deletingId === ch.id

          return (
            <div
              key={ch.id}
              data-testid={`custom-challenge-item-${ch.id}`}
              className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-card/60 p-3 transition-colors hover:border-foreground/20 hover:bg-muted/40"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <DifficultyBadge difficulty={ch.difficulty} />
                  <Badge variant="outline">{ch.category}</Badge>
                  <Badge variant="secondary" className="font-mono">
                    {formatLanguageLabel(ch.language)}
                  </Badge>
                  {ch.is_solved && (
                    <Badge variant="success" className="tabular-nums">
                      {ch.best_score !== null
                        ? `Solved · ${ch.best_score}%`
                        : "Solved"}
                    </Badge>
                  )}
                </div>

                <Link
                  href={`/challenges/${ch.slug}`}
                  onClick={onCloseModal}
                  className="truncate text-sm font-medium text-foreground hover:underline"
                >
                  {ch.title}
                </Link>

                <p className="line-clamp-1 text-xs text-muted-foreground">
                  {ch.description}
                </p>

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                  <span>{ch.estimated_minutes}m</span>
                  <span aria-hidden="true">·</span>
                  <span>{ch.line_count} lines</span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="outline"
                  size="xs"
                  asChild
                  onClick={onCloseModal}
                >
                  <Link href={`/challenges/${ch.slug}`}>
                    <span>Review</span>
                    <ArrowRight aria-hidden="true" data-icon="inline-end" />
                  </Link>
                </Button>

                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={isDeleting}
                  onClick={() => handleDelete(ch)}
                  aria-label={`Delete ${ch.title}`}
                  className="text-muted-foreground hover:text-destructive"
                  data-testid={`delete-challenge-${ch.id}`}
                >
                  {isDeleting ? (
                    <Loader2
                      aria-hidden="true"
                      className="animate-spin motion-reduce:animate-none"
                    />
                  ) : (
                    <Trash2 aria-hidden="true" />
                  )}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
