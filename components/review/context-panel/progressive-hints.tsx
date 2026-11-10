import * as React from "react"
import { KeyRound, Lightbulb, Lock, Sparkles, Unlock } from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { ChallengeHint } from "@/types/challenge"
import { MarkdownTypography } from "./formatted-markdown"

export const DEFAULT_TIER_META: Record<
  number,
  { title: string; penalty: string }
> = {
  1: { title: "Contextual Clue", penalty: "-10% score penalty" },
  2: { title: "Vulnerability Class", penalty: "-20% score penalty" },
  3: { title: "Line Pointer", penalty: "-30% score penalty" },
}

export interface ProgressiveHintsSectionProps {
  tiers: Array<{ tier: number; hint?: ChallengeHint }>
  unlockedTiers: number[]
  openAccordions: string[]
  setOpenAccordions: React.Dispatch<React.SetStateAction<string[]>>
  hintsLoading: boolean
  onUnlockTier: (tier: number) => void
}

export function ProgressiveHintsSection({
  tiers,
  unlockedTiers,
  openAccordions,
  setOpenAccordions,
  hintsLoading,
  onUnlockTier,
}: ProgressiveHintsSectionProps) {
  const unlockedSet = React.useMemo(
    () => new Set(unlockedTiers),
    [unlockedTiers]
  )

  return (
    <section
      data-testid="section-progressive-hints"
      aria-labelledby="progressive-hints-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Lightbulb className="size-4" />
          </div>
          <h2
            id="progressive-hints-heading"
            className="text-sm font-semibold tracking-tight text-foreground sm:text-base"
          >
            Progressive Hints
          </h2>
        </div>
        <Badge
          variant={unlockedTiers.length > 0 ? "default" : "outline"}
          className="text-[11px] font-medium"
        >
          {unlockedTiers.length} of 3 Unlocked
        </Badge>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        <span>Progressive reveal: Tiers unlock sequentially (1 → 2 → 3).</span>
        {unlockedTiers.length === 0 && (
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            100% Score Potential
          </span>
        )}
      </div>

      <Accordion
        type="multiple"
        value={openAccordions}
        onValueChange={setOpenAccordions}
        className="w-full border-border/80 bg-card"
      >
        {tiers.map(({ tier, hint }) => {
          const isUnlocked = unlockedSet.has(tier)
          const previousTierUnlocked = tier === 1 || unlockedSet.has(tier - 1)
          const canUnlock = !isUnlocked && previousTierUnlocked

          const defaultMeta = DEFAULT_TIER_META[tier] || {
            title: `Tier ${tier}`,
            penalty: `-${tier * 10}% score penalty`,
          }

          const tierTitle = hint?.label || defaultMeta.title
          const hintText = hint?.text || ""

          return (
            <AccordionItem
              key={`hint-item-${tier}`}
              value={`tier-${tier}`}
              data-testid={`hint-item-${tier}`}
              className={cn(
                "border-border/60 transition-colors",
                isUnlocked ? "bg-card" : "bg-muted/10 opacity-90"
              )}
            >
              {isUnlocked ? (
                <AccordionTrigger className="group px-4 py-3 text-xs hover:no-underline">
                  <div className="flex flex-1 items-center justify-between gap-3 pr-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground transition-colors">
                        {tier}
                      </div>
                      <div className="flex flex-col items-start gap-0.5 text-left">
                        <span className="font-semibold text-foreground">
                          Tier {tier}: {tierTitle}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Available to review
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="gap-1 border-primary/20 bg-primary/10 text-[10px] font-medium text-primary"
                      >
                        <Unlock className="size-2.5" />
                        Unlocked
                      </Badge>
                    </div>
                  </div>
                </AccordionTrigger>
              ) : (
                <div className="flex flex-1 items-center justify-between gap-3 px-4 py-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
                        canUnlock
                          ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {tier}
                    </div>
                    <div className="flex flex-col items-start gap-0.5 text-left">
                      <span className="font-semibold text-foreground">
                        Tier {tier}: {tierTitle}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {defaultMeta.penalty}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {canUnlock ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        data-testid={`unlock-hint-btn-${tier}`}
                        onClick={() => onUnlockTier(tier)}
                        className="gap-1.5 border-amber-500/40 bg-amber-500/10 text-[11px] font-semibold text-amber-800 hover:bg-amber-500/20 dark:text-amber-300"
                      >
                        <KeyRound className="size-3" />
                        <span>Unlock Hint</span>
                      </Button>
                    ) : (
                      <Badge
                        variant="outline"
                        className="gap-1 border-border/80 bg-muted/50 text-[10px] font-normal text-muted-foreground"
                      >
                        <Lock className="size-2.5" />
                        Locked
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {isUnlocked && (
                <AccordionContent className="px-4 pb-4 text-xs">
                  <div className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/[0.03] p-3.5 dark:bg-primary/[0.06]">
                    <div className="flex items-center gap-1.5 font-semibold text-primary">
                      <Sparkles className="size-3.5" />
                      <span>{tierTitle} Guidance</span>
                    </div>
                    {hintsLoading && !hintText ? (
                      <Skeleton className="h-12 w-full" />
                    ) : (
                      <MarkdownTypography
                        content={
                          hintText ||
                          "Review code context and investigate anomalous state transformations."
                        }
                        className="text-foreground/90"
                      />
                    )}
                  </div>
                </AccordionContent>
              )}
            </AccordionItem>
          )
        })}
      </Accordion>
    </section>
  )
}
