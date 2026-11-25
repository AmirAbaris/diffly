"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertCircle,
  Info,
  Key,
  RotateCcw,
  Settings,
  SquarePen,
} from "lucide-react"
import { CoachConversation } from "@/components/coach/coach-conversation"
import { CoachMessageList } from "@/components/coach/coach-message-list"
import { CoachPromptInput } from "@/components/coach/coach-prompt-input"
import {
  CREATE_CHALLENGE_PROMPT,
  PATTERNS_QUICK_PROMPTS,
  type CoachQuickPrompt,
  type UseCoachChatResult,
} from "@/components/coach/use-coach-chat"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { MessageScrollerItem } from "@/components/ui/message-scroller"
import { Skeleton } from "@/components/ui/skeleton"
import type {
  CoachPersistenceNotice,
  CoachThreadSessionState,
} from "@/types/coach-thread"

const WORKSPACE_SUGGESTIONS: readonly CoachQuickPrompt[] = [
  ...PATTERNS_QUICK_PROMPTS,
  {
    id: "create-challenge",
    label: "Create a custom challenge",
    prompt: CREATE_CHALLENGE_PROMPT,
  },
]

function WorkspaceDisconnectedCard() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card
        data-testid="coach-disconnected-state"
        className="w-full max-w-md border-border bg-card shadow-none"
      >
        <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
          <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-muted/40 text-foreground">
            <Key aria-hidden="true" className="size-4" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-base font-semibold tracking-tight text-balance text-foreground">
              Connect an AI provider to start coaching
            </h1>
            <p className="text-xs leading-relaxed text-pretty text-muted-foreground">
              Add a Google Gemini, OpenAI, Anthropic, or OpenAI-compatible key
              once in Settings to unlock streaming coaching and targeted drills.
            </p>
          </div>
          <Button size="sm" asChild>
            <Link href="/settings" data-testid="coach-settings-link">
              <Settings data-icon="inline-start" aria-hidden="true" />
              <span>Configure AI in Settings</span>
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function WorkspaceZeroState({
  disabled,
  onSelectPrompt,
}: {
  disabled: boolean
  onSelectPrompt: (prompt: string) => void
}) {
  return (
    <MessageScrollerItem messageId="coach-workspace-zero-state">
      <div
        data-testid="coach-workspace-zero-state"
        className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 py-10 text-center"
      >
        <div className="flex flex-col items-center gap-2.5">
          <h1 className="font-pixel text-2xl tracking-tight text-balance text-foreground">
            Agent Coach
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-pretty text-muted-foreground">
            Analyze your review blind spots, break down missed defects, and
            launch targeted practice drills grounded in your history.
          </p>
        </div>

        <div
          data-testid="coach-quick-prompts"
          className="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2"
        >
          {WORKSPACE_SUGGESTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelectPrompt(item.prompt)}
              data-testid={`coach-quick-prompt-${item.id}`}
              className="flex flex-col gap-1 rounded-xl border border-border/80 bg-card p-3.5 text-left transition-colors hover:border-border hover:bg-muted/30 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            >
              <span className="text-xs font-medium text-foreground">
                {item.label}
              </span>
              <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {item.prompt}
              </span>
            </button>
          ))}
        </div>
      </div>
    </MessageScrollerItem>
  )
}

function ThreadErrorCard({
  message,
  status,
  onRetry,
  onNewChat,
}: {
  message: string
  status?: number
  onRetry: () => void
  onNewChat: () => void
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card
        data-testid="coach-thread-error-state"
        className="w-full max-w-md border-border bg-card shadow-none"
      >
        <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
          <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-muted/40 text-foreground">
            <AlertCircle aria-hidden="true" className="size-4" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-sm font-semibold tracking-tight text-balance text-foreground">
              {status === 404
                ? "Conversation not found"
                : "Could not load conversation"}
            </h2>
            <p className="text-xs leading-relaxed text-pretty text-muted-foreground">
              {message}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {status !== 404 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetry}
                data-testid="coach-thread-retry-button"
              >
                <RotateCcw data-icon="inline-start" aria-hidden="true" />
                <span>Retry</span>
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={onNewChat}
              data-testid="coach-thread-error-new-chat"
            >
              <SquarePen data-icon="inline-start" aria-hidden="true" />
              <span>Start New Chat</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

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
    sendPrompt,
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
  const statusPhase = state.kind === "streaming" ? state.phase : undefined

  return (
    <>
      {persistenceNotice ? (
        <div className="mx-auto w-full max-w-3xl px-4 pt-3 sm:px-6">
          <div
            role="status"
            data-testid="coach-persistence-notice"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-2 text-xs text-muted-foreground"
          >
            <div className="flex items-center gap-2">
              <Info aria-hidden="true" className="size-4 shrink-0" />
              <span>{persistenceNotice.message}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onDismissPersistenceNotice}
            >
              Dismiss
            </Button>
          </div>
        </div>
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
            challengeTool={challengeTool}
          />
        )}
      </CoachConversation>

      {state.kind === "error" ? (
        <div className="mx-auto w-full max-w-3xl px-4 pb-2 sm:px-6">
          <div
            role="alert"
            data-testid="coach-error-banner"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-xs text-destructive"
          >
            <div className="flex items-center gap-2">
              <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
              <span>{state.message}</span>
            </div>
            <div className="flex items-center gap-2">
              {state.isAuthError ? (
                <Link href="/settings" className="font-medium underline">
                  Open Settings
                </Link>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={clearError}
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
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
