"use client"

import * as React from "react"
import { Bot, ChevronDown, ChevronUp } from "lucide-react"
import { DefectTargetSection } from "@/components/review/context-panel/defect-target"
import { EnvironmentSpecsSection } from "@/components/review/context-panel/environment-specs"
import {
  DEFAULT_TIER_META,
  ProgressiveHintsSection,
} from "@/components/review/context-panel/progressive-hints"
import { ScenarioOverviewSection } from "@/components/review/context-panel/scenario-overview"
import { ThreatModelSection } from "@/components/review/context-panel/threat-model"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useChallengeHints } from "@/hooks/use-challenge-hints"
import { cn } from "@/lib/utils"
import type { ChallengeDetail, ChallengeHint } from "@/types/challenge"

export { DEFAULT_TIER_META }

export interface ChallengeContextPanelProps {
  challenge?: ChallengeDetail | null
  isLoading?: boolean
  className?: string
  initialUnlockedTiers?: number[]
  onUnlockHint?: (tier: number) => void
}

export function ChallengeContextPanel({
  challenge,
  isLoading,
  className,
  initialUnlockedTiers,
  onUnlockHint,
}: ChallengeContextPanelProps) {
  const slug = challenge?.slug
  const { hints: apiHints, isLoading: hintsLoading } = useChallengeHints(slug)

  // Local storage persistence key for unlocked tiers per challenge
  const storageKey = slug ? `diffly_hints_${slug}` : null

  const [unlockedTiers, setUnlockedTiers] = React.useState<number[]>(() => {
    if (initialUnlockedTiers && initialUnlockedTiers.length > 0) {
      return initialUnlockedTiers
    }
    if (typeof window !== "undefined" && storageKey) {
      try {
        const saved = window.localStorage.getItem(storageKey)
        if (saved) {
          const parsed = JSON.parse(saved)
          if (Array.isArray(parsed)) return parsed
        }
      } catch {
        // Ignore localStorage error
      }
    }
    return []
  })

  // Accordion open items state
  const [openAccordions, setOpenAccordions] = React.useState<string[]>([])

  // Mobile / Small screen collapse toggle
  const [isMobileCollapsed, setIsMobileCollapsed] = React.useState(false)

  // Save unlocked tiers to localStorage outside state updaters
  React.useEffect(() => {
    if (!storageKey || typeof window === "undefined") return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(unlockedTiers))
    } catch {
      // Ignore localStorage write error
    }
  }, [storageKey, unlockedTiers])

  const handleUnlockTier = React.useCallback(
    (tier: number) => {
      setUnlockedTiers((prev) => {
        if (prev.includes(tier)) return prev
        return [...prev, tier].sort((a, b) => a - b)
      })

      setOpenAccordions((prev) =>
        prev.includes(`tier-${tier}`) ? prev : [...prev, `tier-${tier}`]
      )

      onUnlockHint?.(tier)
    },
    [onUnlockHint]
  )

  // Normalize hints list
  const tiers: Array<{ tier: number; hint?: ChallengeHint }> =
    React.useMemo(() => {
      return [1, 2, 3].map((tierNum) => {
        const found = apiHints.find((h) => h.tier === tierNum)
        return {
          tier: tierNum,
          hint: found,
        }
      })
    }, [apiHints])

  if (isLoading || !challenge) {
    return (
      <div
        data-testid="challenge-context-panel-loading"
        className={cn("flex flex-col gap-6 p-4 sm:p-6", className)}
      >
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="challenge-context-panel"
      className={cn("flex flex-col gap-6 p-4 sm:p-6", className)}
    >
      {/* Mobile Collapsible Header Banner (visible on screens below lg) */}
      <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/40 p-3 lg:hidden">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">
            {challenge.title}
          </span>
        </div>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setIsMobileCollapsed((prev) => !prev)}
          className="gap-1 text-xs text-muted-foreground"
          aria-expanded={!isMobileCollapsed}
          aria-label={
            isMobileCollapsed
              ? "Expand briefing panel"
              : "Collapse briefing panel"
          }
        >
          <span>{isMobileCollapsed ? "Expand Brief" : "Collapse Brief"}</span>
          {isMobileCollapsed ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronUp className="size-3.5" />
          )}
        </Button>
      </div>

      <div
        className={cn(
          "flex flex-col gap-6 transition-all duration-200",
          isMobileCollapsed ? "hidden lg:flex" : "flex"
        )}
      >
        <ScenarioOverviewSection challenge={challenge} />
        <ThreatModelSection challenge={challenge} />
        <DefectTargetSection challenge={challenge} />
        <ProgressiveHintsSection
          tiers={tiers}
          unlockedTiers={unlockedTiers}
          openAccordions={openAccordions}
          setOpenAccordions={setOpenAccordions}
          hintsLoading={hintsLoading}
          onUnlockTier={handleUnlockTier}
        />
        <EnvironmentSpecsSection challenge={challenge} />
      </div>
    </div>
  )
}
