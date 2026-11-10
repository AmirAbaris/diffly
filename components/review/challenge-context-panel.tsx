"use client"

import * as React from "react"
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  FileCode,
  Info,
  KeyRound,
  Lightbulb,
  Lock,
  ShieldAlert,
  Sparkles,
  Terminal,
  Unlock,
} from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useChallengeHints } from "@/hooks/use-challenge-hints"
import { cn } from "@/lib/utils"
import type { ChallengeDetail, ChallengeHint } from "@/types/challenge"

export interface ChallengeContextPanelProps {
  challenge?: ChallengeDetail | null
  isLoading?: boolean
  className?: string
  initialUnlockedTiers?: number[]
  onUnlockHint?: (tier: number) => void
}

const DEFAULT_TIER_META: Record<number, { title: string; penalty: string }> = {
  1: { title: "Contextual Clue", penalty: "-10% score penalty" },
  2: { title: "Vulnerability Class", penalty: "-20% score penalty" },
  3: { title: "Line Pointer", penalty: "-30% score penalty" },
}

/**
 * Renders inline text with support for bold (**text**) and code spans (`code`).
 */
function FormattedInline({ text }: { text: string }) {
  const parts = React.useMemo(() => {
    const raw = text.split(/(\*\*.*?\*\*|`.*?`)/g)
    const counts = new Map<string, number>()
    return raw.map((segment) => {
      const nextCount = (counts.get(segment) ?? 0) + 1
      counts.set(segment, nextCount)
      return {
        key: `inline-${segment}-${nextCount}`,
        raw: segment,
      }
    })
  }, [text])

  return (
    <>
      {parts.map(({ key, raw }) => {
        if (raw.startsWith("**") && raw.endsWith("**")) {
          return (
            <strong key={key} className="font-semibold text-foreground">
              {raw.slice(2, -2)}
            </strong>
          )
        }
        if (raw.startsWith("`") && raw.endsWith("`")) {
          return (
            <code
              key={key}
              className="rounded border border-border/70 bg-muted/70 px-1.5 py-0.5 font-mono text-[11px] text-foreground"
            >
              {raw.slice(1, -1)}
            </code>
          )
        }
        return <span key={key}>{raw}</span>
      })}
    </>
  )
}

/**
 * Lightweight, accessible typography component that parses paragraphs,
 * bullet lists, bold text, and inline code formatting.
 */
function MarkdownTypography({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  const paragraphs = React.useMemo(() => {
    if (!content) return []
    const rawParagraphs = content.split(/\n\s*\n/)
    const pCounts = new Map<string, number>()

    return rawParagraphs.map((para) => {
      const trimmed = para.trim()
      const pCount = (pCounts.get(trimmed) ?? 0) + 1
      pCounts.set(trimmed, pCount)

      const lines = trimmed.split("\n")
      const isBulletList = lines.every(
        (line) => line.trim().startsWith("- ") || line.trim().startsWith("* ")
      )

      const listItems = isBulletList
        ? lines.map((line, lIdx) => {
            const itemText = line.trim().replace(/^[-*]\s+/, "")
            return {
              key: `li-${itemText.slice(0, 16)}-${lIdx}`,
              text: itemText,
            }
          })
        : []

      return {
        key: `para-${trimmed.slice(0, 16)}-${pCount}`,
        trimmed,
        isBulletList,
        listItems,
      }
    })
  }, [content])

  if (!content) return null

  return (
    <div
      className={cn("flex flex-col gap-2.5 text-xs leading-relaxed", className)}
    >
      {paragraphs.map(({ key, trimmed, isBulletList, listItems }) => {
        if (isBulletList) {
          return (
            <ul key={key} className="my-1 flex flex-col gap-1 pl-1">
              {listItems.map((item) => (
                <li key={item.key} className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/70" />
                  <span>
                    <FormattedInline text={item.text} />
                  </span>
                </li>
              ))}
            </ul>
          )
        }

        return (
          <p key={key}>
            <FormattedInline text={trimmed} />
          </p>
        )
      })}
    </div>
  )
}

/**
 * Section 1: Scenario Overview Card
 */
function ScenarioOverviewSection({
  challenge,
}: {
  challenge: ChallengeDetail
}) {
  return (
    <section
      data-testid="section-scenario-overview"
      aria-labelledby="scenario-overview-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Info className="size-4" />
          </div>
          <h2
            id="scenario-overview-heading"
            className="text-sm font-semibold tracking-tight text-foreground sm:text-base"
          >
            Scenario Overview
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className="text-[11px] font-medium capitalize"
          >
            {challenge.difficulty}
          </Badge>
          <Badge variant="secondary" className="text-[11px] font-medium">
            {challenge.category}
          </Badge>
        </div>
      </div>

      <Card className="border-border/80 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Operational Context & Role
          </CardTitle>
          <CardDescription className="sr-only">
            Autonomous agent description and operational context
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <MarkdownTypography
            content={challenge.description}
            className="text-foreground/90"
          />
        </CardContent>
      </Card>
    </section>
  )
}

/**
 * Section 2: Threat Model & Invariants Card
 */
function ThreatModelSection({ challenge }: { challenge: ChallengeDetail }) {
  return (
    <section
      data-testid="section-threat-model"
      aria-labelledby="threat-model-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <ShieldAlert className="size-4" />
          </div>
          <h2
            id="threat-model-heading"
            className="text-sm font-semibold tracking-tight text-foreground sm:text-base"
          >
            Threat Model & Invariants
          </h2>
        </div>
        <Badge
          variant="destructive"
          className="gap-1 text-[10px] font-semibold uppercase"
        >
          <Lock className="size-2.5" />
          Security Invariant
        </Badge>
      </div>

      <Card className="border-destructive/25 bg-destructive/[0.03] dark:bg-destructive/[0.08]">
        <CardContent className="flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-destructive">
            <ShieldAlert className="size-4 shrink-0" />
            <span>Untrusted Inputs & Boundary Risks</span>
          </div>
          <div className="rounded-lg border border-destructive/20 bg-background/60 p-3 text-xs">
            <MarkdownTypography
              content={
                challenge.threat_model ||
                "Untrusted inputs or downstream tool returns may violate system boundary invariants. Ensure strict validation and permission isolation."
              }
              className="text-muted-foreground"
            />
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

/**
 * Section 3: Defect Target Alert Box
 */
function DefectTargetSection({ challenge }: { challenge: ChallengeDetail }) {
  return (
    <section
      data-testid="section-defect-target"
      aria-labelledby="defect-target-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-4" />
          </div>
          <h2
            id="defect-target-heading"
            className="text-sm font-semibold tracking-tight text-foreground sm:text-base"
          >
            Defect Target
          </h2>
        </div>
        <Badge
          variant="outline"
          className="border-amber-500/30 bg-amber-500/10 text-[10px] font-semibold text-amber-700 dark:text-amber-400"
        >
          Evaluation Objective
        </Badge>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 shadow-xs dark:bg-amber-500/15 dark:text-amber-200">
        <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">
          <Sparkles className="size-3" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-semibold tracking-tight">
            Primary Defect Goal:
          </span>
          <p className="leading-relaxed font-medium">
            {challenge.defect_target ||
              "Find 1 Critical Vulnerability in tool execution."}
          </p>
        </div>
      </div>
    </section>
  )
}

interface ProgressiveHintsSectionProps {
  tiers: Array<{ tier: number; hint?: ChallengeHint }>
  unlockedTiers: number[]
  openAccordions: string[]
  setOpenAccordions: React.Dispatch<React.SetStateAction<string[]>>
  hintsLoading: boolean
  onUnlockTier: (tier: number) => void
}

/**
 * Section 4: Progressive Hints Accordion / Drawer
 */
function ProgressiveHintsSection({
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

/**
 * Section 5: Environment & Execution Specs Card
 */
function EnvironmentSpecsSection({
  challenge,
}: {
  challenge: ChallengeDetail
}) {
  const isPython = challenge.language === "python"

  return (
    <section
      data-testid="section-environment-specs"
      aria-labelledby="environment-specs-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Cpu className="size-4" />
        </div>
        <h2
          id="environment-specs-heading"
          className="text-sm font-semibold tracking-tight text-foreground sm:text-base"
        >
          Execution Specs & Rules
        </h2>
      </div>

      <Card className="border-border/80 bg-card">
        <CardContent className="grid grid-cols-2 gap-2.5 p-3.5 sm:grid-cols-3">
          <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/20 p-2.5">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Terminal className="size-3" />
              Runtime
            </span>
            <span className="text-xs font-semibold text-foreground capitalize">
              {isPython ? "Python 3.12" : "Node.js 22"}
            </span>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/20 p-2.5">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock className="size-3" />
              Review Est.
            </span>
            <span className="text-xs font-semibold text-foreground">
              ~{challenge.estimated_minutes} min
            </span>
          </div>

          <div className="col-span-2 flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/20 p-2.5 sm:col-span-1">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <FileCode className="size-3" />
              Target Code
            </span>
            <span className="text-xs font-semibold text-foreground">
              {challenge.line_count} lines
            </span>
          </div>
        </CardContent>
      </Card>
    </section>
  )
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
