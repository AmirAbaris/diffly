"use client"

import * as React from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { CustomChallengeShare } from "@/components/review/context-panel/custom-challenge-share"
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

function readStoredHints(
  slug: string,
  initialUnlockedTiers?: number[]
): number[] {
  if (initialUnlockedTiers && initialUnlockedTiers.length > 0) {
    return initialUnlockedTiers
  }
  if (!slug || typeof window === "undefined") {
    return []
  }
  try {
    const saved = window.localStorage.getItem(`diffly_hints_${slug}`)
    if (saved) {
      const parsed: unknown = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (tier): tier is number =>
            typeof tier === "number" && Number.isInteger(tier) && tier > 0
        )
      }
    }
  } catch {
    // Ignore localStorage read error
  }
  return []
}

function writeStoredHints(slug: string, tiers: number[]): void {
  if (!slug || typeof window === "undefined") {
    return
  }
  try {
    window.localStorage.setItem(`diffly_hints_${slug}`, JSON.stringify(tiers))
  } catch {
    // Ignore localStorage write error
  }
}

export function ChallengeContextPanel({
  challenge,
  hints,
  className,
  initialUnlockedTiers,
  onUnlockHint,
}: ChallengeContextPanelProps) {
  const slug = challenge?.slug?.trim() ?? ""

  const [hintsBySlug, setHintsBySlug] = React.useState<
    Record<string, number[]>
  >({})
  const [openAccordionsBySlug, setOpenAccordionsBySlug] = React.useState<
    Record<string, string[]>
  >({})
  const [isMobileCollapsed, setIsMobileCollapsed] = React.useState(false)

  const storedTiers = React.useMemo(
    () => readStoredHints(slug, initialUnlockedTiers),
    [slug, initialUnlockedTiers]
  )

  const unlockedTiers = slug ? (hintsBySlug[slug] ?? storedTiers) : []
  const openAccordions = slug ? (openAccordionsBySlug[slug] ?? []) : []

  const persistedTiers = slug ? hintsBySlug[slug] : undefined

  React.useEffect(() => {
    if (!slug || persistedTiers === undefined) return
    writeStoredHints(slug, persistedTiers)
  }, [slug, persistedTiers])

  const handleSetOpenAccordions = React.useCallback<
    React.Dispatch<React.SetStateAction<string[]>>
  >(
    (action) => {
      if (!slug) return
      setOpenAccordionsBySlug((prev) => {
        const current = prev[slug] ?? []
        const next = typeof action === "function" ? action(current) : action
        return { ...prev, [slug]: next }
      })
    },
    [slug]
  )

  const handleUnlockTier = React.useCallback(
    (tier: number) => {
      if (!slug) return

      setHintsBySlug((prev) => {
        const current =
          prev[slug] ?? readStoredHints(slug, initialUnlockedTiers)
        if (current.includes(tier)) return prev
        return {
          ...prev,
          [slug]: [...current, tier].sort((a, b) => a - b),
        }
      })

      setOpenAccordionsBySlug((prev) => {
        const current = prev[slug] ?? []
        if (current.includes(`tier-${tier}`)) return prev
        return {
          ...prev,
          [slug]: [...current, `tier-${tier}`],
        }
      })

      onUnlockHint?.(tier)
    },
    [slug, initialUnlockedTiers, onUnlockHint]
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
        <CustomChallengeShare challenge={challenge} />
        <ScenarioOverviewSection challenge={challenge} />
        <ThreatModelSection challenge={challenge} />
        <DefectTargetSection challenge={challenge} />
        <ProgressiveHintsSection
          tiers={tiers}
          unlockedTiers={unlockedTiers}
          openAccordions={openAccordions}
          setOpenAccordions={handleSetOpenAccordions}
          hintsLoading={hintsLoading}
          onUnlockTier={handleUnlockTier}
        />
        <EnvironmentSpecsSection challenge={challenge} />
      </div>
    </div>
  )
}
