"use client"

import * as React from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { DefectTargetSection } from "@/components/review/context-panel/defect-target"
import { EnvironmentSpecsSection } from "@/components/review/context-panel/environment-specs"
import {
  DEFAULT_TIER_META,
  ProgressiveHintsSection,
} from "@/components/review/context-panel/progressive-hints"
import { ScenarioOverviewSection } from "@/components/review/context-panel/scenario-overview"
import { ThreatModelSection } from "@/components/review/context-panel/threat-model"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AsyncSlice } from "@/types/arena-session"
import type { ChallengeDetail, ChallengeHint } from "@/types/challenge"

export { DEFAULT_TIER_META }

export interface ChallengeContextPanelProps {
  challenge: ChallengeDetail
  hints: AsyncSlice<ChallengeHint[]>
  className?: string
  initialUnlockedTiers?: number[]
  onUnlockHint?: (tier: number) => void
}

export function ChallengeContextPanel({
  challenge,
  hints,
  className,
  initialUnlockedTiers,
  onUnlockHint,
}: ChallengeContextPanelProps) {
  const storageKey = `diffly_hints_${challenge.slug}`

  const [unlockedTiers, setUnlockedTiers] = React.useState<number[]>(() => {
    if (initialUnlockedTiers && initialUnlockedTiers.length > 0) {
      return initialUnlockedTiers
    }
    if (typeof window !== "undefined") {
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

  const [openAccordions, setOpenAccordions] = React.useState<string[]>([])
  const [isMobileCollapsed, setIsMobileCollapsed] = React.useState(false)

  React.useEffect(() => {
    if (typeof window === "undefined") return
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

  const apiHints = React.useMemo(
    () => (hints.status === "ready" ? hints.data : []),
    [hints]
  )
  const hintsLoading = hints.status === "loading"

  const tiers: Array<{ tier: number; hint?: ChallengeHint }> =
    React.useMemo(() => {
      return [1, 2, 3].map((tierNum) => ({
        tier: tierNum,
        hint: apiHints.find((h) => h.tier === tierNum),
      }))
    }, [apiHints])

  return (
    <div
      data-testid="challenge-context-panel"
      className={cn("flex flex-col gap-6 p-4 sm:p-6", className)}
    >
      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2 lg:hidden">
        <span className="truncate text-xs font-semibold text-foreground">
          {challenge.title}
        </span>
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
            <ChevronDown aria-hidden="true" className="size-3.5" />
          ) : (
            <ChevronUp aria-hidden="true" className="size-3.5" />
          )}
        </Button>
      </div>

      <div
        className={cn(
          "flex flex-col gap-6",
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
