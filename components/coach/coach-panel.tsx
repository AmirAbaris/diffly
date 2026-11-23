"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertCircle,
  Key,
  RotateCcw,
  SendHorizontal,
  Settings,
  Square,
} from "lucide-react"
import { CoachMessageList } from "@/components/coach/coach-message-list"
import {
  useCoachChat,
  type CoachQuickPrompt,
  type CoachTarget,
} from "@/components/coach/use-coach-chat"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import type { TargetedDrillSuggestion } from "@/lib/ai/coach"

export interface CoachPanelProps {
  chatId?: string
  target: CoachTarget
  quickPrompts: readonly CoachQuickPrompt[]
  emptyTitle?: string
  emptyDescription?: string
  placeholder?: string
  onGenerateDrill: (drill: TargetedDrillSuggestion) => void
}

export function CoachPanel({
  chatId,
  target,
  quickPrompts,
  emptyTitle,
  emptyDescription,
  placeholder = "Ask Agent Coach a question… (Enter to send, Shift+Enter for newline)",
  onGenerateDrill,
}: CoachPanelProps) {
  const [draft, setDraft] = React.useState("")
  const {
    state,
    messages,
    connectionSummary,
    sendPrompt,
    stop,
    clearError,
    resetConversation,
  } = useCoachChat({ chatId, target })

  const isStreaming = state.kind === "streaming"

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault()
    if (isStreaming) return
    const trimmed = draft.trim()
    if (!trimmed) return
    sendPrompt(trimmed)
    setDraft("")
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  }

  if (state.kind === "checking-connection") {
    return (
      <Skeleton
        data-testid="coach-loading-skeleton"
        className="h-28 w-full rounded-lg"
      />
    )
  }

  if (state.kind === "disconnected") {
    return (
      <div
        data-testid="coach-disconnected-state"
        className="flex flex-col justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-4 sm:flex-row sm:items-center"
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
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {connectionSummary ? (
            <Badge
              variant="success"
              data-testid="coach-connected-badge"
              className="font-mono"
            >
              Connected: {connectionSummary}
            </Badge>
          ) : null}
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
          >
            <Settings aria-hidden="true" className="size-3.5" />
            <span>Settings</span>
          </Link>
        </div>

        {messages.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={resetConversation}
            data-testid="coach-reset-button"
          >
            <RotateCcw data-icon="inline-start" aria-hidden="true" />
            <span>Reset</span>
          </Button>
        ) : null}
      </div>

      <div
        data-testid="coach-quick-prompts"
        className="flex flex-wrap items-center gap-1.5"
      >
        {quickPrompts.map((chip) => (
          <Button
            key={chip.id}
            type="button"
            variant="outline"
            size="xs"
            disabled={isStreaming}
            onClick={() => sendPrompt(chip.prompt)}
            data-testid={`coach-quick-prompt-${chip.id}`}
          >
            {chip.label}
          </Button>
        ))}
      </div>

      <CoachMessageList
        messages={messages}
        isStreaming={isStreaming}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        onGenerateDrill={onGenerateDrill}
      />

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

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Ask Agent Coach"
          disabled={isStreaming}
          rows={2}
          className="min-h-12 flex-1 text-sm"
          data-testid="coach-composer-input"
        />
        {isStreaming ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void stop()}
            data-testid="coach-stop-button"
          >
            <Square data-icon="inline-start" aria-hidden="true" />
            <span>Stop</span>
          </Button>
        ) : (
          <Button
            type="submit"
            size="sm"
            disabled={draft.trim().length === 0}
            data-testid="coach-send-button"
          >
            <SendHorizontal data-icon="inline-start" aria-hidden="true" />
            <span>Send</span>
          </Button>
        )}
      </form>
    </div>
  )
}
