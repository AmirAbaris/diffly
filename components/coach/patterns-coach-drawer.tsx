"use client"

import * as React from "react"
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react"
import { CoachPanel } from "@/components/coach/coach-panel"
import {
  PATTERNS_QUICK_PROMPTS,
  type CoachTarget,
} from "@/components/coach/use-coach-chat"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import type { TargetedDrillSuggestion } from "@/lib/ai/coach"
import { cn } from "@/lib/utils"
import { useCustomChallengeModalStore } from "@/stores/custom-challenge-modal-store"

export interface PatternsCoachDrawerProps {
  onOpeningTargetedDrill?: () => void
}

const PATTERNS_TARGET: CoachTarget = {
  mode: "patterns",
  sliceLimit: 5,
  missedLimit: 10,
}

export function PatternsCoachDrawer({
  onOpeningTargetedDrill,
}: PatternsCoachDrawerProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [hasOpened, setHasOpened] = React.useState(false)
  const panelId = React.useId()
  const openCustomChallengeModal = useCustomChallengeModalStore(
    (s) => s.openCustomChallengeModal
  )

  const handleToggle = () => {
    const next = !isOpen
    setIsOpen(next)
    if (next) {
      setHasOpened(true)
    }
  }

  const handleGenerateDrill = React.useCallback(
    (drill: TargetedDrillSuggestion) => {
      onOpeningTargetedDrill?.()
      openCustomChallengeModal("generate", {
        topic: drill.topic,
        language: drill.language,
        difficulty: drill.difficulty,
      })
    },
    [onOpeningTargetedDrill, openCustomChallengeModal]
  )

  return (
    <Card
      data-testid="patterns-coach-drawer"
      className="gap-0 overflow-hidden py-0"
    >
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        data-testid="patterns-coach-toggle"
        className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:px-6"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-foreground">
            <Sparkles aria-hidden="true" className="size-4" />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold tracking-tight text-foreground">
                Analyze My Patterns
              </span>
              <Badge variant="secondary" size="sm">
                Agent Coach
              </Badge>
            </div>
            <p className="text-xs text-pretty text-muted-foreground">
              Inspect blind spots across your review history and launch a
              targeted drill.
            </p>
          </div>
        </div>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground">
          {isOpen ? (
            <ChevronUp aria-hidden="true" className="size-4" />
          ) : (
            <ChevronDown aria-hidden="true" className="size-4" />
          )}
        </span>
      </button>

      {hasOpened ? (
        <div
          id={panelId}
          className={cn(
            "border-t border-border/70 px-4 py-4 sm:px-6",
            !isOpen && "hidden"
          )}
        >
          <CoachPanel
            chatId="patterns-coach"
            target={PATTERNS_TARGET}
            quickPrompts={PATTERNS_QUICK_PROMPTS}
            emptyTitle="Analyze your review blind spots"
            emptyDescription="Ask about your weakest categories, precision vs. recall balance, or request a targeted drill."
            onGenerateDrill={handleGenerateDrill}
          />
        </div>
      ) : null}
    </Card>
  )
}
