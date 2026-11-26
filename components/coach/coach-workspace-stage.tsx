"use client"

import * as React from "react"
import { CoachConversation } from "@/components/coach/coach-conversation"
import { CoachMessageList } from "@/components/coach/coach-message-list"
import { CoachPromptInput } from "@/components/coach/coach-prompt-input"
import {
  ThreadErrorCard,
  WorkspaceDebriefContextChip,
  WorkspaceDisconnectedCard,
  WorkspaceErrorBanner,
  WorkspacePersistenceBanner,
  WorkspaceZeroState,
} from "@/components/coach/coach-workspace-cards"
import type { UseCoachChatResult } from "@/components/coach/use-coach-chat"
import { Skeleton } from "@/components/ui/skeleton"
import type {
  CoachPersistenceNotice,
  CoachThreadSessionState,
} from "@/types/coach-thread"

export interface CoachWorkspaceStageProps {
  chat: UseCoachChatResult
  sessionState: CoachThreadSessionState
  persistenceNotice: CoachPersistenceNotice | null
  draft: string
  onDraftChange: (value: string) => void
  onSubmit: () => void
  onCreateChallenge: () => void
  onNewChat: () => void
  onRetryLoadThread: () => void
  onDismissPersistenceNotice: () => void
}

export function CoachWorkspaceStage({
  chat,
  sessionState,
  persistenceNotice,
  draft,
  onDraftChange,
  onSubmit,
  onCreateChallenge,
  onNewChat,
  onRetryLoadThread,
  onDismissPersistenceNotice,
}: CoachWorkspaceStageProps) {
  const {
    state,
    messages,
    connectionSummary,
    challengeTool,
    mutatingAction,
    actionError,
    clearActionError,
    sendPrompt,
    regenerateLastReply,
    editAndResendMessage,
    stop,
    clearError,
  } = chat

  if (state.kind === "checking-connection") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-4 py-8 sm:px-6">
        <Skeleton
          data-testid="coach-loading-skeleton"
          className="h-32 w-full rounded-2xl"
        />
      </div>
    )
  }

  if (state.kind === "disconnected") {
    return <WorkspaceDisconnectedCard />
  }

  if (sessionState.kind === "loading") {
    return (
      <div
        data-testid="coach-thread-loading-skeleton"
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8 sm:px-6"
      >
        <Skeleton className="h-14 w-3/4 rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-16 w-2/3 rounded-xl" />
      </div>
    )
  }

  if (sessionState.kind === "error") {
    return (
      <ThreadErrorCard
        message={sessionState.message}
        status={sessionState.status}
        onRetry={onRetryLoadThread}
        onNewChat={onNewChat}
      />
    )
  }

  const isStreaming = state.kind === "streaming"
  const isMutating = mutatingAction.kind !== "idle"
  const statusPhase = state.kind === "streaming" ? state.phase : undefined
  const debriefChallengeSlug =
    sessionState.kind === "active" &&
    sessionState.mode === "debrief" &&
    sessionState.challengeSlug
      ? sessionState.challengeSlug
      : null
  const bannerError =
    state.kind === "error"
      ? { message: state.message, isAuthError: state.isAuthError }
      : actionError
        ? { message: actionError, isAuthError: false }
        : null

  return (
    <>
      {persistenceNotice ? (
        <WorkspacePersistenceBanner
          notice={persistenceNotice}
          onDismiss={onDismissPersistenceNotice}
        />
      ) : null}

      {debriefChallengeSlug ? (
        <WorkspaceDebriefContextChip challengeSlug={debriefChallengeSlug} />
      ) : null}

      <CoachConversation contentClassName="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        {messages.length === 0 ? (
          <WorkspaceZeroState
            disabled={isStreaming}
            onSelectPrompt={sendPrompt}
          />
        ) : (
          <CoachMessageList
            messages={messages}
            isStreaming={isStreaming}
            statusPhase={statusPhase}
            isMutating={isMutating}
            challengeTool={challengeTool}
            onRegenerate={() => void regenerateLastReply()}
            onEditAndResend={editAndResendMessage}
          />
        )}
      </CoachConversation>

      {bannerError ? (
        <WorkspaceErrorBanner
          message={bannerError.message}
          isAuthError={bannerError.isAuthError}
          onDismiss={() => {
            clearError()
            clearActionError()
          }}
        />
      ) : null}

      <div className="shrink-0 bg-background px-4 pt-1 pb-4 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <CoachPromptInput
            value={draft}
            onChange={onDraftChange}
            onSubmit={onSubmit}
            onStop={() => void stop()}
            isStreaming={isStreaming}
            connectionSummary={connectionSummary}
            conversationAction={{ kind: "new-chat", onAction: onNewChat }}
            onCreateChallenge={onCreateChallenge}
          />
        </div>
      </div>
    </>
  )
}
