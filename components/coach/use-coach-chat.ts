"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { useAIConnection } from "@/hooks/use-ai-connection"
import { formatAIConnectionSummary } from "@/lib/ai/catalog"
import {
  parseCoachErrorMessage,
  type CoachUIMessage,
  type DebriefContext,
} from "@/lib/ai/coach"

export interface CoachQuickPrompt {
  readonly id: string
  readonly label: string
  readonly prompt: string
}

export const PATTERNS_QUICK_PROMPTS: readonly CoachQuickPrompt[] = [
  {
    id: "blind-spots",
    label: "Analyze my blind spots",
    prompt:
      "Analyze my review history and identify my biggest blind spots, weakest categories, and recurring failure modes.",
  },
  {
    id: "precision-recall",
    label: "Precision vs. recall",
    prompt:
      "Compare my precision and recall across languages and tell me what habit to change first.",
  },
  {
    id: "targeted-drill",
    label: "Generate targeted drill",
    prompt:
      "Based on my weakest review pattern, recommend one targeted practice drill using suggest_targeted_drill.",
  },
] as const

export const DEBRIEF_QUICK_PROMPTS: readonly CoachQuickPrompt[] = [
  {
    id: "missed-defects",
    label: "Why did I miss defects?",
    prompt:
      "Walk me through the defects I missed in this submission and what signal in the code should have caught my eye.",
  },
  {
    id: "review-flagged-lines",
    label: "Review my flagged lines",
    prompt:
      "Evaluate my flagged lines and critique against the staff benchmark. Where was I spot on and where did I over-flag?",
  },
  {
    id: "practice-similar-bug",
    label: "Practice similar bug",
    prompt:
      "Suggest a targeted follow-up drill for the core weakness exposed by this challenge using suggest_targeted_drill.",
  },
] as const

export type CoachTarget =
  | { mode: "patterns"; sliceLimit?: number; missedLimit?: number }
  | { mode: "debrief"; context: DebriefContext }

export type CoachChatStatus =
  | { kind: "checking-connection" }
  | { kind: "disconnected" }
  | { kind: "streaming"; phase: "submitted" | "streaming" }
  | { kind: "error"; message: string; isAuthError: boolean }
  | { kind: "ready" }

export interface UseCoachChatOptions {
  chatId?: string
  target: CoachTarget
}

export interface UseCoachChatResult {
  state: CoachChatStatus
  messages: CoachUIMessage[]
  connectionSummary: string | null
  sendPrompt: (prompt: string) => void
  stop: () => Promise<void>
  clearError: () => void
  resetConversation: () => void
}

const AUTH_ERROR_PATTERN =
  /\b401\b|unauthorized|no active ai provider|authentication failed|not connected/i

function buildCoachRequestBody(target: CoachTarget): Record<string, unknown> {
  if (target.mode === "patterns") {
    return {
      mode: "patterns",
      sliceLimit: target.sliceLimit ?? 5,
      missedLimit: target.missedLimit ?? 10,
    }
  }
  return {
    mode: "debrief",
    context: target.context,
  }
}

export function useCoachChat({
  chatId,
  target,
}: UseCoachChatOptions): UseCoachChatResult {
  const connection = useAIConnection()
  const connectionSummary = formatAIConnectionSummary(connection)

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport<CoachUIMessage>({
        api: "/api/coach",
      }),
    []
  )

  const {
    messages,
    status,
    error,
    sendMessage,
    stop,
    setMessages,
    clearError,
  } = useChat<CoachUIMessage>({
    id: chatId,
    transport,
  })

  const parsedErrorMessage = error ? parseCoachErrorMessage(error) : null
  const isAuthError =
    parsedErrorMessage !== null && AUTH_ERROR_PATTERN.test(parsedErrorMessage)

  const lastRefreshedErrorRef = React.useRef<Error | null>(null)
  React.useEffect(() => {
    if (error && isAuthError && lastRefreshedErrorRef.current !== error) {
      lastRefreshedErrorRef.current = error
      void connection.mutate()
    }
  }, [connection, error, isAuthError])

  const state: CoachChatStatus = React.useMemo(() => {
    if (connection.isLoading) {
      return { kind: "checking-connection" }
    }
    if (!connection.isConnected) {
      return { kind: "disconnected" }
    }
    if (status === "submitted" || status === "streaming") {
      return { kind: "streaming", phase: status }
    }
    if (parsedErrorMessage) {
      return { kind: "error", message: parsedErrorMessage, isAuthError }
    }
    return { kind: "ready" }
  }, [
    connection.isConnected,
    connection.isLoading,
    isAuthError,
    parsedErrorMessage,
    status,
  ])

  const sendPrompt = React.useCallback(
    (prompt: string) => {
      const trimmed = prompt.trim()
      if (
        !trimmed ||
        !connection.isConnected ||
        status === "submitted" ||
        status === "streaming"
      ) {
        return
      }
      clearError()
      void sendMessage(
        { text: trimmed },
        { body: buildCoachRequestBody(target) }
      )
    },
    [clearError, connection.isConnected, sendMessage, status, target]
  )

  const resetConversation = React.useCallback(() => {
    void stop()
    clearError()
    setMessages([])
  }, [clearError, setMessages, stop])

  return {
    state,
    messages,
    connectionSummary,
    sendPrompt,
    stop,
    clearError,
    resetConversation,
  }
}
