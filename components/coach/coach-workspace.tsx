"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { AlertCircle, Key, Plus, Settings, Sparkles } from "lucide-react"
import { CoachContextRail } from "@/components/coach/coach-context-rail"
import { CoachConversation } from "@/components/coach/coach-conversation"
import { CoachInlineGenerator } from "@/components/coach/coach-inline-generator"
import { CoachMessageList } from "@/components/coach/coach-message-list"
import { CoachPromptInput } from "@/components/coach/coach-prompt-input"
import {
  PATTERNS_QUICK_PROMPTS,
  useCoachChat,
  type CoachQuickPrompt,
  type CoachTarget,
  type UseCoachChatResult,
} from "@/components/coach/use-coach-chat"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { MessageScrollerItem } from "@/components/ui/message-scroller"
import { Skeleton } from "@/components/ui/skeleton"
import { useCoachPatterns } from "@/hooks/use-coach-patterns"

const WORKSPACE_TARGET: CoachTarget = {
  mode: "patterns",
  sliceLimit: 5,
  missedLimit: 10,
}

const WORKSPACE_SUGGESTIONS: readonly CoachQuickPrompt[] = [
  ...PATTERNS_QUICK_PROMPTS,
  {
    id: "review-checklist",
    label: "Build my review checklist",
    prompt:
      "Based on my recurring misses, draft a concise 5-point code review checklist I should run before submitting my next diff.",
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
          <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-muted/40 text-foreground">
            <Sparkles aria-hidden="true" className="size-4" />
          </div>
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

function WorkspaceConnectedColumn({
  chat,
  draft,
  onDraftChange,
  onSubmit,
}: {
  chat: UseCoachChatResult
  draft: string
  onDraftChange: (value: string) => void
  onSubmit: () => void
}) {
  const { state, messages, connectionSummary, sendPrompt, stop } = chat
  const isStreaming = state.kind === "streaming"
  const statusPhase = state.kind === "streaming" ? state.phase : undefined

  return (
    <>
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
                onClick={chat.clearError}
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
            hasMessages={messages.length > 0}
            onReset={chat.resetConversation}
          />
        </div>
      </div>
    </>
  )
}

export function CoachWorkspace() {
  const searchParams = useSearchParams()
  const [draft, setDraft] = React.useState("")
  const [showGenerator, setShowGenerator] = React.useState(false)
  const consumedPromptRef = React.useRef<string | null>(null)

  const { patterns, isLoading: patternsLoading } = useCoachPatterns()
  const chat = useCoachChat({
    chatId: "coach-workspace",
    target: WORKSPACE_TARGET,
  })
  const { state, sendPrompt } = chat
  const initialPrompt = searchParams.get("prompt")?.trim() ?? ""

  React.useEffect(() => {
    if (
      initialPrompt &&
      state.kind === "ready" &&
      consumedPromptRef.current !== initialPrompt
    ) {
      consumedPromptRef.current = initialPrompt
      sendPrompt(initialPrompt)
      window.history.replaceState(window.history.state, "", "/coach")
    }
  }, [initialPrompt, sendPrompt, state.kind])

  const handleToggleGenerator = React.useCallback(() => {
    setShowGenerator((prev) => !prev)
  }, [])

  const handleSubmit = () => {
    const trimmed = draft.trim()
    if (!trimmed || state.kind === "streaming") return
    sendPrompt(trimmed)
    setDraft("")
  }

  const isConnected =
    state.kind !== "disconnected" && state.kind !== "checking-connection"

  return (
    <div
      data-testid="coach-workspace"
      className="flex min-h-0 flex-1 overflow-hidden"
    >
      <CoachContextRail
        patterns={patterns}
        isLoading={patternsLoading}
        disabled={state.kind !== "ready"}
        onSelectPrompt={sendPrompt}
        onToggleGenerator={handleToggleGenerator}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
            <span className="truncate text-xs font-semibold tracking-tight text-foreground">
              Agent Coach
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!isConnected}
            aria-expanded={showGenerator}
            onClick={handleToggleGenerator}
            data-testid="coach-top-generate-button"
            className="h-8 text-xs"
          >
            <Plus data-icon="inline-start" aria-hidden="true" />
            <span>Generate Challenge</span>
          </Button>
        </div>

        {showGenerator && isConnected ? (
          <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-4 sm:px-6">
            <CoachInlineGenerator onClose={() => setShowGenerator(false)} />
          </div>
        ) : null}

        {state.kind === "checking-connection" ? (
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-4 py-8 sm:px-6">
            <Skeleton
              data-testid="coach-loading-skeleton"
              className="h-32 w-full rounded-2xl"
            />
          </div>
        ) : state.kind === "disconnected" ? (
          <WorkspaceDisconnectedCard />
        ) : (
          <WorkspaceConnectedColumn
            chat={chat}
            draft={draft}
            onDraftChange={setDraft}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  )
}
