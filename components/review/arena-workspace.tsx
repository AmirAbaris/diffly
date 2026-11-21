"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { AnnotationProvider } from "@/components/review/annotations/annotation-layer"
import { ShortcutOverlay } from "@/components/review/annotations/shortcut-overlay"
import { useDraftAnnotationLayer } from "@/components/review/annotations/use-draft-annotation-layer"
import { useReviewHotkeys } from "@/components/review/annotations/use-review-hotkeys"
import { ArenaCommentDrawer } from "@/components/review/arena-comment-drawer"
import { ArenaHeader } from "@/components/review/arena-header"
import { ChallengeContextPanel } from "@/components/review/challenge-context-panel"
import { CodeViewer } from "@/components/review/code-viewer"
import { SubmissionBar } from "@/components/review/submission-bar"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { findingAt } from "@/lib/review"
import { FLAGGING_GUIDE_STORAGE_KEY } from "@/lib/storage-keys"
import { cn } from "@/lib/utils"
import { useArenaUIStore } from "@/stores/arena-ui-store"
import type { ReadyChallengeSession } from "@/types/arena-session"

const ReviewResultModal = dynamic(
  () =>
    import("@/components/review/review-result-modal").then(
      (mod) => mod.ReviewResultModal
    ),
  { ssr: false }
)

const FlaggingGuideModal = dynamic(
  () =>
    import("@/components/review/flagging-guide-modal").then(
      (mod) => mod.FlaggingGuideModal
    ),
  { ssr: false }
)

const SubmissionHistoryDrawer = dynamic(
  () =>
    import("@/components/review/submission-history-drawer").then(
      (mod) => mod.SubmissionHistoryDrawer
    ),
  { ssr: false }
)

export interface ArenaWorkspaceProps {
  session: ReadyChallengeSession
}

/**
 * Mounted only when `session.status === "ready"`, keyed by `session.challenge.slug`.
 */
export function ArenaWorkspace({ session }: ArenaWorkspaceProps) {
  const {
    challenge,
    lineSpace,
    hints,
    history,
    nextChallengeSlug,
    draft,
    isSubmitting,
    submitReview,
  } = session

  const mobileTab = useArenaUIStore((s) => s.mobileTab)
  const submissionResult = useArenaUIStore((s) => s.submissionResult)
  const gradeReport = useArenaUIStore((s) => s.gradeReport)
  const isResultModalOpen = useArenaUIStore((s) => s.isResultModalOpen)
  const isHistoryOpen = useArenaUIStore((s) => s.isHistoryOpen)
  const submittedReview = useArenaUIStore((s) => s.submittedReview)
  const setMobileTab = useArenaUIStore((s) => s.setMobileTab)
  const setIsResultModalOpen = useArenaUIStore((s) => s.setIsResultModalOpen)
  const setIsHistoryOpen = useArenaUIStore((s) => s.setIsHistoryOpen)
  const [selectedFilePath, setSelectedFilePath] = React.useState<string>(
    () => challenge.files?.[0]?.path ?? ""
  )
  const [isShortcutOverlayOpen, setIsShortcutOverlayOpen] =
    React.useState(false)
  const [isFlagGuideOpen, setIsFlagGuideOpen] = React.useState(() => {
    if (typeof window === "undefined") return false
    try {
      return !window.localStorage.getItem(FLAGGING_GUIDE_STORAGE_KEY)
    } catch {
      return false
    }
  })

  const { layer, cursorApi, setEditingFindingId, focusFinding } =
    useDraftAnnotationLayer({
      draft: draft.reviewDraft,
      dispatch: draft.dispatch,
      lineSpace,
      onSelectFile: setSelectedFilePath,
    })

  useReviewHotkeys({
    enabled: !isResultModalOpen && !isHistoryOpen && !isFlagGuideOpen,
    onAction: (action) => {
      switch (action) {
        case "cursorDown":
          cursorApi.move("down")
          return true
        case "cursorUp":
          cursorApi.move("up")
          return true
        case "extendDown":
          cursorApi.extend("down", (from, to) => {
            const outcome = draft.dispatch({ type: "flagRange", from, to })
            if (outcome.focus) setEditingFindingId(outcome.focus)
          })
          return true
        case "extendUp":
          cursorApi.extend("up", (from, to) => {
            const outcome = draft.dispatch({ type: "flagRange", from, to })
            if (outcome.focus) setEditingFindingId(outcome.focus)
          })
          return true
        case "toggleFlag": {
          const target = cursorApi.cursor ?? cursorApi.firstFlaggableLine()
          if (!target) return false
          layer.activate(target)
          return true
        }
        case "commentOrEdit": {
          const target = cursorApi.cursor ?? cursorApi.firstFlaggableLine()
          if (!target) return false
          const existing = findingAt(draft.reviewDraft, target)
          if (existing) {
            setEditingFindingId(existing.id)
          } else {
            layer.activate(target)
          }
          return true
        }
        case "nextFinding":
          cursorApi.jumpFinding(draft.reviewDraft.findings, "next")
          return true
        case "prevFinding":
          cursorApi.jumpFinding(draft.reviewDraft.findings, "prev")
          return true
        case "saveOrSubmit":
          if (draft.validation.valid && !isSubmitting) {
            void submitReview()
            return true
          }
          return false
        case "escape":
          if (isShortcutOverlayOpen) {
            setIsShortcutOverlayOpen(false)
            return true
          }
          setEditingFindingId(null)
          cursorApi.clearSelectionAnchor()
          return true
        case "toggleHelp":
          setIsShortcutOverlayOpen((prev) => !prev)
          return true
      }
    },
  })

  const attemptCount = history.status === "ready" ? history.data.length : 0

  return (
    <AnnotationProvider layer={layer}>
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
                {draft.reviewDraft.findings.length > 0 && (
                  <Badge variant="warning" size="sm" className="tabular-nums">
                    {draft.reviewDraft.findings.length}
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
                files={challenge.files}
                language={challenge.language}
                flaggedLines={draft.flaggedLines}
                onToggleLine={draft.toggleFlaggedLine}
                selectedFilePath={selectedFilePath}
                onSelectFilePath={setSelectedFilePath}
                onOpenGuide={() => setIsFlagGuideOpen(true)}
              />

              <ArenaCommentDrawer
                reviewDraft={draft.reviewDraft}
                onChangeSummaryNote={draft.setComments}
                onSelectFinding={(f) => focusFinding(f, true)}
                onRemoveFinding={(id) =>
                  draft.dispatch({ type: "removeFinding", id })
                }
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
          reviewDraft={draft.reviewDraft}
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
          gradeReport={gradeReport}
          challengeSlug={challenge.slug}
          challengeTitle={challenge.title}
          nextChallengeSlug={nextChallengeSlug}
          onTryAgain={() => setIsResultModalOpen(false)}
          userFlaggedLines={
            submittedReview?.flaggedLines ?? submissionResult?.flagged_lines
          }
          userComments={submittedReview?.comments ?? submissionResult?.comments}
          codeSnippet={challenge.code_snippet}
          files={challenge.files}
          language={challenge.language}
        />

        <FlaggingGuideModal
          open={isFlagGuideOpen}
          onOpenChange={setIsFlagGuideOpen}
        />

        <ShortcutOverlay
          open={isShortcutOverlayOpen}
          onOpenChange={setIsShortcutOverlayOpen}
        />

        <SubmissionHistoryDrawer
          open={isHistoryOpen}
          onOpenChange={setIsHistoryOpen}
          challengeSlug={challenge.slug}
        />
      </div>
    </AnnotationProvider>
  )
}
