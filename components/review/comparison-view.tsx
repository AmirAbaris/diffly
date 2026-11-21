"use client"

import * as React from "react"
import useSWR from "swr"
import { ComparisonBody } from "@/components/review/comparison/comparison-body"
import { useShareTokenContext } from "@/components/review/share-token-context"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { appendShareTokenQuery } from "@/lib/share-url"
import { cn } from "@/lib/utils"
import type { ChallengeSolutionResponse } from "@/types/challenge"

export interface ComparisonViewProps {
  challengeId?: string | number
  challengeSlug?: string
  shareToken?: string | null
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
  shareToken: propShareToken,
  userFlaggedLines = DEFAULT_FLAGGED_LINES,
  userComments = "",
  canonicalSolution: propSolution,
  language,
  className,
  defaultView = "comparison",
  onViewChange,
}: ComparisonViewProps) {
  const [activeTab, setActiveTab] = React.useState<"comparison" | "diff">(
    defaultView
  )
  const { slug: ctxSlug, shareToken: ctxToken } = useShareTokenContext()
  const activeShareToken =
    propShareToken ??
    (challengeSlug && ctxSlug === challengeSlug ? ctxToken : null)

  const targetIdentifier = challengeId ?? challengeSlug
  const swrKey =
    !propSolution && targetIdentifier
      ? appendShareTokenQuery(
          `/api/challenges/${targetIdentifier}/solution?reveal=true`,
          activeShareToken
        )
      : null

  const {
    data: fetchedSolution,
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR<ChallengeSolutionResponse>(swrKey, {
    keepPreviousData: false,
  })

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
        "flex w-full flex-col gap-5 rounded-xl border border-border bg-card p-4 text-foreground sm:p-6",
        className
      )}
    >
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              Side-by-Side Review Comparison
            </h3>
            <Badge variant="secondary" size="sm">
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
              className="text-xs"
            >
              <span>Critique Comparison</span>
            </TabsTrigger>
            <TabsTrigger
              value="diff"
              data-testid="toggle-diff-view"
              className="text-xs"
            >
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
        language={language}
        onRetry={handleRetry}
        onTabChange={handleTabChange}
      />
    </div>
  )
}
