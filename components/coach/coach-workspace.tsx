"use client"

import * as React from "react"
import { PanelLeft, Plus, SquarePen } from "lucide-react"
import {
  CoachContextRail,
  type CoachRailTabsProps,
} from "@/components/coach/coach-context-rail"
import { CoachMobileDrawer } from "@/components/coach/coach-mobile-drawer"
import { CoachWorkspaceStage } from "@/components/coach/coach-workspace-stage"
import { useCoachWorkspaceSession } from "@/components/coach/use-coach-workspace-session"
import { Button } from "@/components/ui/button"
import { useCoachPatterns } from "@/hooks/use-coach-patterns"

export function CoachWorkspace() {
  const [draft, setDraft] = React.useState("")
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false)

  const { patterns, isLoading: patternsLoading } = useCoachPatterns()
  const {
    chat,
    sessionState,
    activeThreadId,
    persistenceNotice,
    threads,
    threadsLoading,
    selectThread,
    startNewChat,
    retryLoadThread,
    renameThread,
    deleteThread,
    dismissPersistenceNotice,
  } = useCoachWorkspaceSession()

  const { state, sendPrompt, startChallengeCreation } = chat
  const isConnected =
    state.kind !== "disconnected" && state.kind !== "checking-connection"
  const isStreaming = state.kind === "streaming"

  const handleSubmit = () => {
    const trimmed = draft.trim()
    if (!trimmed || isStreaming) return
    sendPrompt(trimmed)
    setDraft("")
  }

  const railProps: CoachRailTabsProps = {
    patterns,
    patternsLoading,
    contextDisabled: !isConnected || isStreaming,
    onSelectPrompt: sendPrompt,
    onCreateChallenge: startChallengeCreation,
    threads,
    threadsLoading,
    activeThreadId,
    onSelectThread: selectThread,
    onNewChat: startNewChat,
    onRenameThread: renameThread,
    onDeleteThread: deleteThread,
  }

  return (
    <div
      data-testid="coach-workspace"
      className="flex min-h-0 flex-1 overflow-hidden"
    >
      <CoachContextRail {...railProps} />
      <CoachMobileDrawer
        {...railProps}
        open={mobileDrawerOpen}
        onOpenChange={setMobileDrawerOpen}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-13 shrink-0 items-center justify-between gap-2 border-b border-border px-4 sm:gap-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open chats and context"
              data-testid="coach-mobile-rail-trigger"
              className="lg:hidden"
            >
              <PanelLeft aria-hidden="true" className="size-4" />
            </Button>
            <span className="truncate text-xs font-semibold tracking-tight text-foreground">
              Agent Coach
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startNewChat}
              data-testid="coach-top-new-chat-button"
              className="h-8 px-2.5 text-xs sm:px-3"
            >
              <SquarePen data-icon="inline-start" aria-hidden="true" />
              <span>New Chat</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!isConnected || isStreaming}
              onClick={startChallengeCreation}
              data-testid="coach-top-generate-button"
              className="h-8 px-2.5 text-xs sm:px-3"
            >
              <Plus data-icon="inline-start" aria-hidden="true" />
              <span>
                <span className="hidden sm:inline">Generate </span>Challenge
              </span>
            </Button>
          </div>
        </div>

        <CoachWorkspaceStage
          chat={chat}
          sessionState={sessionState}
          persistenceNotice={persistenceNotice}
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={handleSubmit}
          onCreateChallenge={startChallengeCreation}
          onNewChat={startNewChat}
          onRetryLoadThread={retryLoadThread}
          onDismissPersistenceNotice={dismissPersistenceNotice}
        />
      </div>
    </div>
  )
}
