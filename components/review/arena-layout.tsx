"use client"

import * as React from "react"
import { BookOpen, Code2 } from "lucide-react"
import { ArenaCodeViewer } from "@/components/review/arena-code-viewer"
import { ArenaCommentDrawer } from "@/components/review/arena-comment-drawer"
import { ChallengeContextPanel } from "@/components/review/challenge-context-panel"
import { ArenaHeader } from "@/components/review/arena-header"
import { ReviewResultModal } from "@/components/review/review-result-modal"
import { SubmissionBar } from "@/components/review/submission-bar"
import { SubmissionHistoryDrawer } from "@/components/review/submission-history-drawer"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useChallenge } from "@/hooks/use-challenge"
import { useChallenges } from "@/hooks/use-challenges"
import { useReviewDraft } from "@/hooks/use-review-draft"
import { useSubmissionHistory } from "@/hooks/use-submission-history"
import { mutateUserStats } from "@/hooks/use-user-stats"
import { toast } from "@/hooks/use-toast"
import { apiClient } from "@/lib/axios"
import { cn } from "@/lib/utils"
import type { ReviewSubmissionResponse } from "@/types/challenge"

export interface ArenaLayoutProps {
  slug: string
}

export function ArenaLayout({ slug }: ArenaLayoutProps) {
  const {
    challenge,
    isLoading,
    error,
    mutate: mutateChallenge,
  } = useChallenge(slug)
  const { submissions, mutate: mutateHistory } = useSubmissionHistory(slug)

  const {
    flaggedLines,
    comments,
    setComments,
    toggleFlaggedLine,
    clearFlaggedLines,
    resetDraft,
  } = useReviewDraft(slug)

  const [mobileTab, setMobileTab] = React.useState<"brief" | "code">("brief")
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [submissionResult, setSubmissionResult] =
    React.useState<ReviewSubmissionResponse | null>(null)
  const [isResultModalOpen, setIsResultModalOpen] = React.useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false)
  const [submittedReview, setSubmittedReview] = React.useState<{
    flaggedLines: number[]
    comments: string
  } | null>(null)

  const { challenges } = useChallenges()
  const nextChallengeSlug = React.useMemo(() => {
    if (!challenges || challenges.length === 0) return null
    const currentIndex = challenges.findIndex(
      (c) => c.slug === slug || (challenge?.id && c.id === challenge.id)
    )
    if (currentIndex >= 0 && currentIndex < challenges.length - 1) {
      return challenges[currentIndex + 1].slug
    }
    return null
  }, [challenges, slug, challenge?.id])

  const handleReviewSuccess = React.useCallback(
    (data: ReviewSubmissionResponse) => {
      setSubmittedReview((prev) => ({
        flaggedLines:
          data.flagged_lines && data.flagged_lines.length > 0
            ? data.flagged_lines
            : (prev?.flaggedLines ?? flaggedLines),
        comments:
          data.comments && data.comments.length > 0
            ? data.comments
            : (prev?.comments ?? comments.trim()),
      }))
      setSubmissionResult(data)
      setIsResultModalOpen(true)
      mutateHistory()
      mutateChallenge()
      mutateUserStats()
    },
    [flaggedLines, comments, mutateHistory, mutateChallenge]
  )

  const handleSubmitReview = React.useCallback(async () => {
    if (!flaggedLines.length || !comments.trim() || isSubmitting) return
    setIsSubmitting(true)
    const targetId = challenge?.id ?? slug

    try {
      const response = await apiClient.post<ReviewSubmissionResponse>(
        `/api/challenges/${targetId}/review`,
        {
          flagged_lines: flaggedLines,
          comments: comments.trim(),
        }
      )

      toast({
        title: "Review submitted successfully",
        description: `Score: ${response.data.score}% • Review breakdown loaded.`,
        variant: "success",
      })

      handleReviewSuccess(response.data)
      resetDraft()
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ||
        (err instanceof Error ? err.message : "Failed to submit review")

      toast({
        title: "Submission failed",
        description: errorMsg,
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [
    flaggedLines,
    comments,
    isSubmitting,
    challenge?.id,
    slug,
    handleReviewSuccess,
    resetDraft,
  ])

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <h1 className="text-xl font-bold text-destructive">
          Challenge Not Found
        </h1>
        <p className="text-sm text-muted-foreground">
          Could not load challenge with slug &quot;{slug}&quot;.
        </p>
      </div>
    )
  }

  return (
    <div
      data-testid="arena-layout"
      className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground"
    >
      {/* Top Navigation Bar */}
      <ArenaHeader
        challenge={challenge}
        isLoading={isLoading}
        onOpenHistory={() => setIsHistoryOpen(true)}
        attemptCount={submissions.length}
      />

      {/* Mobile / Tablet Tab Switcher (Visible only below 1024px) */}
      <div className="flex shrink-0 border-b border-border bg-muted/30 px-4 py-2 lg:hidden">
        <Tabs
          value={mobileTab}
          onValueChange={(val) => setMobileTab(val as "brief" | "code")}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="brief" className="gap-1.5 text-xs">
              <BookOpen className="size-3.5" />
              <span>Context & Rules</span>
            </TabsTrigger>
            <TabsTrigger value="code" className="gap-1.5 text-xs">
              <Code2 className="size-3.5" />
              <span>Code & Review</span>
              {flaggedLines.length > 0 && (
                <span className="py-0.2 ml-1 rounded-full bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                  {flaggedLines.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Main Split Area (Full Height with Independent Scrolling Containers) */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Pane: Scenario Context, Environment, Rules of Engagement */}
        <aside
          aria-label="Scenario Context and Environment"
          className={cn(
            "min-h-0 flex-col overflow-y-auto border-border bg-card/30 lg:flex lg:w-[42%] lg:border-r xl:w-[40%]",
            mobileTab === "brief" ? "flex w-full" : "hidden"
          )}
        >
          <ChallengeContextPanel challenge={challenge} isLoading={isLoading} />
        </aside>

        {/* Right Pane: Interactive Code Viewer and Inline Comment Drawer */}
        <main
          aria-label="Code Viewer and Review Editor"
          className={cn(
            "min-h-0 flex-col overflow-y-auto bg-background p-4 sm:p-6 lg:flex lg:w-[58%] xl:w-[60%]",
            mobileTab === "code" ? "flex w-full" : "hidden"
          )}
        >
          <div className="flex flex-col gap-4">
            <ArenaCodeViewer
              code={challenge?.code_snippet || ""}
              language={challenge?.language}
              flaggedLines={flaggedLines}
              onToggleLine={toggleFlaggedLine}
            />

            <ArenaCommentDrawer
              flaggedLines={flaggedLines}
              onToggleLine={toggleFlaggedLine}
              onClearFlaggedLines={clearFlaggedLines}
              comment={comments}
              onChangeComment={setComments}
              onSubmitReview={handleSubmitReview}
              isSubmitting={isSubmitting}
            />
          </div>
        </main>
      </div>

      {/* Sticky Bottom Review Submission Bar */}
      <SubmissionBar
        challengeSlug={slug}
        challengeId={challenge?.id}
        flaggedLines={flaggedLines}
        comments={comments}
        onResetDraft={resetDraft}
        onSubmitReview={handleSubmitReview}
        onSubmitSuccess={handleReviewSuccess}
        onViewResults={() => setIsResultModalOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        attemptCount={submissions.length}
        hasSubmitted={!!submissionResult}
        isSubmitting={isSubmitting}
      />

      {/* Review Evaluation Result Modal */}
      <ReviewResultModal
        open={isResultModalOpen}
        onOpenChange={setIsResultModalOpen}
        result={submissionResult}
        challengeSlug={slug}
        challengeTitle={challenge?.title}
        nextChallengeSlug={nextChallengeSlug}
        onTryAgain={() => setIsResultModalOpen(false)}
        userFlaggedLines={
          submittedReview?.flaggedLines ?? submissionResult?.flagged_lines
        }
        userComments={submittedReview?.comments ?? submissionResult?.comments}
        codeSnippet={challenge?.code_snippet}
        language={challenge?.language}
      />

      {/* Submission History Drawer */}
      <SubmissionHistoryDrawer
        open={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        challengeSlug={slug}
      />
    </div>
  )
}
