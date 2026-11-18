"use client"

import * as React from "react"
import { ArenaCommentDrawer } from "@/components/review/arena-comment-drawer"
import { ArenaHeader } from "@/components/review/arena-header"
import { ChallengeContextPanel } from "@/components/review/challenge-context-panel"
import { CodeViewer } from "@/components/review/code-viewer"
import {
  FlaggingGuideModal,
  FLAGGING_GUIDE_STORAGE_KEY,
} from "@/components/review/flagging-guide-modal"
import { ReviewResultModal } from "@/components/review/review-result-modal"
import { SubmissionBar } from "@/components/review/submission-bar"
import { SubmissionHistoryDrawer } from "@/components/review/submission-history-drawer"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { useArenaUIStore } from "@/stores/arena-ui-store"
import type { ReadyChallengeSession } from "@/types/arena-session"

export interface ArenaWorkspaceProps {
  session: ReadyChallengeSession
}

/**
 * Mounted only when `session.status === "ready"`, keyed by `session.challenge.slug`.
 */
export function ArenaWorkspace({ session }: ArenaWorkspaceProps) {
  const {
    challenge,
    hints,
    history,
    nextChallengeSlug,
    draft,
    isSubmitting,
    submitReview,
  } = session

  const mobileTab = useArenaUIStore((s) => s.mobileTab)
  const submissionResult = useArenaUIStore((s) => s.submissionResult)
  const isResultModalOpen = useArenaUIStore((s) => s.isResultModalOpen)
  const isHistoryOpen = useArenaUIStore((s) => s.isHistoryOpen)
  const submittedReview = useArenaUIStore((s) => s.submittedReview)
  const setMobileTab = useArenaUIStore((s) => s.setMobileTab)
  const setIsResultModalOpen = useArenaUIStore((s) => s.setIsResultModalOpen)
  const setIsHistoryOpen = useArenaUIStore((s) => s.setIsHistoryOpen)
  const [isFlagGuideOpen, setIsFlagGuideOpen] = React.useState(() => {
    if (typeof window === "undefined") return false
    try {
      return !window.localStorage.getItem(FLAGGING_GUIDE_STORAGE_KEY)
    } catch {
      return false
    }
  })

  const attemptCount = history.status === "ready" ? history.data.length : 0

  return (
    <div
      data-testid="arena-layout"
      className="flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground"
    >
      <ArenaHeader
        challenge={challenge}
        onOpenHistory={() => setIsHistoryOpen(true)}
        attemptCount={attemptCount}
      />

      <div className="flex shrink-0 border-b border-border bg-muted/20 px-4 py-2 lg:hidden">
        <Tabs
          value={mobileTab}
          onValueChange={(val) => setMobileTab(val as "brief" | "code")}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="brief" className="text-xs">
              Context &amp; Rules
            </TabsTrigger>
            <TabsTrigger value="code" className="gap-1.5 text-xs">
              <span>Code &amp; Review</span>
              {draft.flaggedLines.length > 0 && (
                <Badge variant="warning" size="sm" className="tabular-nums">
                  {draft.flaggedLines.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          aria-label="Scenario Context and Environment"
          className={cn(
            "min-h-0 flex-col overflow-y-auto border-border bg-card/30 lg:flex lg:w-[42%] lg:border-r xl:w-[40%]",
            mobileTab === "brief" ? "flex w-full" : "hidden"
          )}
        >
          <ChallengeContextPanel challenge={challenge} hints={hints} />
        </aside>

        <main
          aria-label="Code Viewer and Review Editor"
          className={cn(
            "min-h-0 flex-col overflow-y-auto bg-background p-4 sm:p-6 lg:flex lg:w-[58%] xl:w-[60%]",
            mobileTab === "code" ? "flex w-full" : "hidden"
          )}
        >
          <div className="flex flex-col gap-4">
            <CodeViewer
              code={challenge.code_snippet}
              language={challenge.language}
              flaggedLines={draft.flaggedLines}
              onToggleLine={draft.toggleFlaggedLine}
              onOpenGuide={() => setIsFlagGuideOpen(true)}
            />

            <ArenaCommentDrawer
              flaggedLines={draft.flaggedLines}
              onToggleLine={draft.toggleFlaggedLine}
              onClearFlaggedLines={draft.clearFlaggedLines}
              onOpenFlagGuide={() => setIsFlagGuideOpen(true)}
              comment={draft.comments}
              onChangeComment={draft.setComments}
              onSubmitReview={submitReview}
              isSubmitting={isSubmitting}
            />
          </div>
        </main>
      </div>

      <SubmissionBar
        flaggedLines={draft.flaggedLines}
        comments={draft.comments}
        onResetDraft={draft.resetDraft}
        onOpenFlagGuide={() => setIsFlagGuideOpen(true)}
        onSubmitReview={submitReview}
        onViewResults={() => setIsResultModalOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        attemptCount={attemptCount}
        hasSubmitted={!!submissionResult}
        isSubmitting={isSubmitting}
      />

      <ReviewResultModal
        open={isResultModalOpen}
        onOpenChange={setIsResultModalOpen}
        result={submissionResult}
        challengeSlug={challenge.slug}
        challengeTitle={challenge.title}
        nextChallengeSlug={nextChallengeSlug}
        onTryAgain={() => setIsResultModalOpen(false)}
        userFlaggedLines={
          submittedReview?.flaggedLines ?? submissionResult?.flagged_lines
        }
        userComments={submittedReview?.comments ?? submissionResult?.comments}
        codeSnippet={challenge.code_snippet}
        language={challenge.language}
      />

      <FlaggingGuideModal
        open={isFlagGuideOpen}
        onOpenChange={setIsFlagGuideOpen}
      />

      <SubmissionHistoryDrawer
        open={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        challengeSlug={challenge.slug}
      />
    </div>
  )
}
