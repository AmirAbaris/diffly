"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowUpRight,
  Info,
  Key,
  MessageSquareCode,
  RotateCcw,
  Settings,
  SquarePen,
} from "lucide-react"
import {
  CREATE_CHALLENGE_PROMPT,
  PATTERNS_QUICK_PROMPTS,
  type CoachQuickPrompt,
} from "@/components/coach/use-coach-chat"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { MessageScrollerItem } from "@/components/ui/message-scroller"
import type { CoachPersistenceNotice } from "@/types/coach-thread"

const WORKSPACE_SUGGESTIONS: readonly CoachQuickPrompt[] = [
  ...PATTERNS_QUICK_PROMPTS,
  {
    id: "create-challenge",
    label: "Create a custom challenge",
    prompt: CREATE_CHALLENGE_PROMPT,
  },
]

export function WorkspaceDisconnectedCard() {
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

export function WorkspaceZeroState({
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

export function ThreadErrorCard({
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

export function WorkspacePersistenceBanner({
  notice,
  onDismiss,
}: {
  notice: CoachPersistenceNotice
  onDismiss: () => void
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-3 sm:px-6">
      <div
        role="status"
        data-testid="coach-persistence-notice"
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-2 text-xs text-muted-foreground"
      >
        <div className="flex items-center gap-2">
          <Info aria-hidden="true" className="size-4 shrink-0" />
          <span>{notice.message}</span>
        </div>
        <Button type="button" variant="ghost" size="xs" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}

export function WorkspaceDebriefContextChip({
  challengeSlug,
}: {
  challengeSlug: string
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-3 sm:px-6">
      <div
        data-testid="coach-debrief-context-chip"
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-muted/30 px-3.5 py-2 text-xs"
      >
        <div className="flex min-w-0 items-center gap-2">
          <MessageSquareCode
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <Badge variant="secondary" size="sm">
            Debrief
          </Badge>
          <span className="truncate font-mono text-xs text-foreground">
            {challengeSlug}
          </span>
        </div>
        <Link
          href={`/challenges/${encodeURIComponent(challengeSlug)}`}
          data-testid="coach-debrief-challenge-link"
          className="inline-flex shrink-0 items-center gap-1 font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span>View challenge</span>
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
    </div>
  )
}

export function WorkspaceErrorBanner({
  message,
  isAuthError,
  onDismiss,
}: {
  message: string
  isAuthError: boolean
  onDismiss: () => void
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-2 sm:px-6">
      <div
        role="alert"
        data-testid="coach-error-banner"
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-xs text-destructive"
      >
        <div className="flex items-center gap-2">
          <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
          <span>{message}</span>
        </div>
        <div className="flex items-center gap-2">
          {isAuthError ? (
            <Link href="/settings" className="font-medium underline">
              Open Settings
            </Link>
          ) : null}
          <Button type="button" variant="ghost" size="xs" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  )
}
