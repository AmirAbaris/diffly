"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Loader2, Sparkles, Trash2 } from "lucide-react"
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
import type { ChallengeSummary } from "@/types/challenge"

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
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" />
        Loading your custom challenges…
      </div>
    )
  }

  if (challenges.length === 0) {
    return (
      <Empty data-testid="custom-challenges-empty" className="border py-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Sparkles aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No custom challenges yet</EmptyTitle>
          <EmptyDescription>
            You have 5 available custom slots. Generate your first personalized
            code review challenge using Gemini!
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
        <span>Your Private Library ({challenges.length}/5)</span>
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
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {ch.language}
                  </Badge>
                  <Badge
                    variant={
                      ch.difficulty === "Hard"
                        ? "destructive"
                        : ch.difficulty === "Medium"
                          ? "warning"
                          : "success"
                    }
                    className="text-[10px]"
                  >
                    {ch.difficulty}
                  </Badge>
                  {ch.is_solved && (
                    <Badge variant="success" className="text-[10px]">
                      Solved
                    </Badge>
                  )}
                </div>

                <Link
                  href={`/challenges/${ch.slug}`}
                  onClick={onCloseModal}
                  className="truncate text-xs font-medium text-foreground hover:underline"
                >
                  {ch.title}
                </Link>

                <p className="line-clamp-1 text-[11px] text-muted-foreground">
                  {ch.description}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="outline"
                  size="xs"
                  asChild
                  onClick={onCloseModal}
                >
                  <Link href={`/challenges/${ch.slug}`}>
                    Review
                    <ArrowRight aria-hidden="true" className="ml-1 size-3" />
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
                      className="size-3.5 animate-spin"
                    />
                  ) : (
                    <Trash2 aria-hidden="true" className="size-3.5" />
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
