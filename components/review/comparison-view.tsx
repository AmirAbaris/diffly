"use client"

import * as React from "react"
import { Columns2, GitCompare, Sparkles } from "lucide-react"
import useSWR from "swr"
import { ComparisonBody } from "@/components/review/comparison/comparison-body"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { ChallengeSolutionResponse } from "@/types/challenge"

export interface ComparisonViewProps {
  challengeId?: string | number
  challengeSlug?: string
  userFlaggedLines?: number[]
  userComments?: string
  canonicalSolution?: ChallengeSolutionResponse | null
  codeSnippet?: string
  language?: string
  className?: string
  defaultView?: "comparison" | "diff"
  onViewChange?: (view: "comparison" | "diff") => void
}

const DEFAULT_FLAGGED_LINES: number[] = []

export function ComparisonView({
  challengeId,
  challengeSlug,
  userFlaggedLines = DEFAULT_FLAGGED_LINES,
  userComments = "",
  canonicalSolution: propSolution,
  className,
  defaultView = "comparison",
  onViewChange,
}: ComparisonViewProps) {
  const [activeTab, setActiveTab] = React.useState<"comparison" | "diff">(
    defaultView
  )

  const targetIdentifier = challengeId ?? challengeSlug
  const swrKey =
    !propSolution && targetIdentifier
      ? `/api/challenges/${targetIdentifier}/solution?reveal=true`
      : null

  const {
    data: fetchedSolution,
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR<ChallengeSolutionResponse>(swrKey)

  const solution = propSolution ?? fetchedSolution ?? null

  const errorMessage = fetchError
    ? (fetchError as { response?: { data?: { detail?: string } } })?.response
        ?.data?.detail ||
      (fetchError instanceof Error
        ? fetchError.message
        : "Failed to load canonical solution")
    : null

  const handleTabChange = React.useCallback(
    (tab: "comparison" | "diff") => {
      setActiveTab(tab)
      onViewChange?.(tab)
    },
    [onViewChange]
  )

  const handleRetry = React.useCallback(() => {
    void mutate()
  }, [mutate])

  return (
    <div
      data-testid="comparison-view"
      className={cn(
        "flex w-full flex-col gap-5 rounded-2xl border border-border/80 bg-card p-4 text-foreground shadow-sm sm:p-6",
        className
      )}
    >
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h3 className="text-base font-bold tracking-tight text-foreground sm:text-lg">
              Side-by-Side Review Comparison
            </h3>
            <Badge
              variant="outline"
              className="border-primary/30 bg-primary/10 text-[10px] font-semibold text-primary"
            >
              Staff Benchmark
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Compare your code critique against the senior staff benchmark and
            examine the canonical fix diff.
          </p>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(val) => handleTabChange(val as "comparison" | "diff")}
          className="w-full sm:w-auto"
        >
          <TabsList className="grid w-full grid-cols-2 sm:w-auto">
            <TabsTrigger
              value="comparison"
              data-testid="toggle-comment-view"
              className="gap-1.5 text-xs"
            >
              <Columns2 className="size-3.5" />
              <span>Critique Comparison</span>
            </TabsTrigger>
            <TabsTrigger
              value="diff"
              data-testid="toggle-diff-view"
              className="gap-1.5 text-xs"
            >
              <GitCompare className="size-3.5" />
              <span>Fix Diff</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ComparisonBody
        isLoading={isLoading}
        errorMessage={errorMessage}
        activeTab={activeTab}
        userFlaggedLines={userFlaggedLines}
        userComments={userComments}
        solution={solution}
        onRetry={handleRetry}
        onTabChange={handleTabChange}
      />
    </div>
  )
}
