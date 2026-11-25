"use client"

import * as React from "react"
import Link from "next/link"
import { AlertCircle, Key, Settings } from "lucide-react"
import { CoachConversation } from "@/components/coach/coach-conversation"
import { CoachMessageList } from "@/components/coach/coach-message-list"
import { CoachPromptInput } from "@/components/coach/coach-prompt-input"
import {
  useCoachChat,
  type CoachQuickPrompt,
  type CoachTarget,
} from "@/components/coach/use-coach-chat"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { TargetedDrillSuggestion } from "@/lib/ai/coach"

export interface CoachPanelProps {
  chatId?: string
  target: CoachTarget
  quickPrompts: readonly CoachQuickPrompt[]
  emptyTitle?: string
  emptyDescription?: string
  placeholder?: string
  onGenerateDrill?: (drill: TargetedDrillSuggestion) => void
}

export function CoachPanel({
  chatId,
  target,
  quickPrompts,
  emptyTitle = "Start a coaching session",
  emptyDescription = "Pick a prompt below or ask a question about this submission.",
  placeholder = "Ask Agent Coach a question…",
  onGenerateDrill,
}: CoachPanelProps) {
  const [draft, setDraft] = React.useState("")
  const {
    state,
    messages,
    connectionSummary,
    challengeTool,
    sendPrompt,
    stop,
    clearError,
    resetConversation,
  } = useCoachChat({ chatId, target })

  const isStreaming = state.kind === "streaming"
  const statusPhase = state.kind === "streaming" ? state.phase : undefined

  const handleSubmit = () => {
    if (isStreaming) return
    const trimmed = draft.trim()
    if (!trimmed) return
    sendPrompt(trimmed)
    setDraft("")
  }

  if (state.kind === "checking-connection") {
    return (
      <Skeleton
        data-testid="coach-loading-skeleton"
        className="h-28 w-full rounded-xl"
      />
    )
  }

  if (state.kind === "disconnected") {
    return (
      <div
        data-testid="coach-disconnected-state"
        className="flex flex-col justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 p-4 sm:flex-row sm:items-center"
      >
        <div className="flex items-start gap-2.5">
          <Key
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">
              Connect an AI provider to use Agent Coach
            </span>
            <p className="text-xs leading-relaxed text-pretty text-muted-foreground">
              Configure Google Gemini, OpenAI, Anthropic, or an
              OpenAI-compatible key once in Settings to enable coaching.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild className="shrink-0">
          <Link href="/settings" data-testid="coach-settings-link">
            <Settings data-icon="inline-start" aria-hidden="true" />
            <span>Configure AI in Settings</span>
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div data-testid="coach-panel" className="flex flex-col gap-3">
      {messages.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/15 p-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">
              {emptyTitle}
            </span>
            <p className="text-xs text-pretty text-muted-foreground">
              {emptyDescription}
            </p>
          </div>

          <div
            data-testid="coach-quick-prompts"
            className="grid grid-cols-1 gap-2 sm:grid-cols-3"
          >
            {quickPrompts.map((chip) => (
              <button
                key={chip.id}
                type="button"
                disabled={isStreaming}
                onClick={() => sendPrompt(chip.prompt)}
                data-testid={`coach-quick-prompt-${chip.id}`}
                className="flex flex-col gap-1 rounded-lg border border-border/70 bg-card px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
              >
                <span className="text-xs font-medium text-foreground">
                  {chip.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex max-h-96 flex-col overflow-hidden rounded-xl border border-border/70 bg-muted/15">
          <CoachConversation contentClassName="p-4">
            <CoachMessageList
              messages={messages}
              isStreaming={isStreaming}
              statusPhase={statusPhase}
              onGenerateDrill={onGenerateDrill}
              challengeTool={challengeTool}
            />
          </CoachConversation>
        </div>
      )}

      {state.kind === "error" ? (
        <div
          role="alert"
          data-testid="coach-error-banner"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
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
      ) : null}

      <CoachPromptInput
        value={draft}
        onChange={setDraft}
        onSubmit={handleSubmit}
        onStop={() => void stop()}
        isStreaming={isStreaming}
        connectionSummary={connectionSummary}
        placeholder={placeholder}
        hasMessages={messages.length > 0}
        onReset={resetConversation}
      />
    </div>
  )
}
