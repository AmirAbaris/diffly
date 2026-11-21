"use client"

import * as React from "react"
import useSWR from "swr"
import {
  ComparisonBody,
  type ComparisonTab,
} from "@/components/review/comparison/comparison-body"
import { useShareTokenContext } from "@/components/review/share-token-context"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { GradeReport } from "@/lib/review"
import { appendShareTokenQuery } from "@/lib/share-url"
import { cn } from "@/lib/utils"
import type {
  ChallengeFile,
  ChallengeSolutionResponse,
  FlaggedLine,
} from "@/types/challenge"

export interface ComparisonViewProps {
  challengeId?: string | number
  challengeSlug?: string
  shareToken?: string | null
  userFlaggedLines?: FlaggedLine[]
  userComments?: string
  canonicalSolution?: ChallengeSolutionResponse | null
  codeSnippet?: string
  files?: ChallengeFile[]
  gradeReport?: GradeReport | null
  language?: string
  className?: string
  defaultView?: ComparisonTab
  onViewChange?: (view: ComparisonTab) => void
}

const DEFAULT_FLAGGED_LINES: FlaggedLine[] = []

export function ComparisonView({
  challengeId,
  challengeSlug,
  shareToken: propShareToken,
  userFlaggedLines = DEFAULT_FLAGGED_LINES,
  userComments = "",
  canonicalSolution: propSolution,
  codeSnippet,
  files,
  gradeReport = null,
  language,
  className,
  defaultView = "comparison",
  onViewChange,
}: ComparisonViewProps) {
  const [activeTab, setActiveTab] = React.useState<ComparisonTab>(defaultView)
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
    (tab: ComparisonTab) => {
      setActiveTab(tab)
      onViewChange?.(tab)
    },
    [onViewChange]
  )

  const handleRetry = React.useCallback(() => {
    void mutate()
  }, [mutate])

  const hasAnnotatedSource =
    Boolean(codeSnippet) || Boolean(files && files.length > 0)

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
          onValueChange={(val) => handleTabChange(val as ComparisonTab)}
          className="w-full sm:w-auto"
        >
          <TabsList
            className={cn(
              "grid w-full sm:w-auto",
              hasAnnotatedSource ? "grid-cols-3" : "grid-cols-2"
            )}
          >
            <TabsTrigger
              value="comparison"
              data-testid="toggle-comment-view"
              className="text-xs"
            >
              <span>Critique Comparison</span>
            </TabsTrigger>
            {hasAnnotatedSource && (
              <TabsTrigger
                value="annotated"
                data-testid="toggle-annotated-view"
                className="text-xs"
              >
                <span>Annotated Code</span>
              </TabsTrigger>
            )}
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
        codeSnippet={codeSnippet}
        files={files}
        gradeReport={gradeReport}
        language={language}
        onRetry={handleRetry}
        onTabChange={handleTabChange}
      />
    </div>
  )
}
