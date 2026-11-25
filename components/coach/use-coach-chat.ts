"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai"
import {
  useCoachChallengeTool,
  type CoachChallengeToolController,
} from "@/components/coach/use-coach-challenge-tool"
import { useAIConnection } from "@/hooks/use-ai-connection"
import { formatAIConnectionSummary } from "@/lib/ai/catalog"
import {
  parseCoachErrorMessage,
  type CoachUIMessage,
  type DebriefContext,
} from "@/lib/ai/coach"
import { sliceCoachMessageWindow } from "@/lib/ai/coach-window"
import type { CoachPersistenceDegradationReason } from "@/types/coach-thread"

const COACH_THREAD_ID_HEADER = "X-Coach-Thread-Id"
const COACH_PERSISTENCE_HEADER = "X-Coach-Persistence"

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

export const CREATE_CHALLENGE_PROMPT =
  "Create a custom code review challenge for me."

export type CoachTarget =
  | { mode: "patterns"; sliceLimit?: number; missedLimit?: number }
  | { mode: "debrief"; context: DebriefContext }

export type CoachChatStatus =
  | { kind: "checking-connection" }
  | { kind: "disconnected" }
  | { kind: "streaming"; phase: "submitted" | "streaming" }
  | { kind: "error"; message: string; isAuthError: boolean }
  | { kind: "ready" }

export interface CoachChatPersistenceAdapter {
  getThreadId: () => string | null
  getSessionEpoch: () => number
  onThreadIdResolved: (threadId: string, requestEpoch: number) => void
  onPersistenceDegraded: (
    reason: CoachPersistenceDegradationReason,
    requestEpoch: number
  ) => void
  onTurnFinished?: (requestEpoch: number) => void
}

export interface UseCoachChatOptions {
  chatId?: string
  target: CoachTarget
  persistence?: CoachChatPersistenceAdapter
}

export interface UseCoachChatResult {
  state: CoachChatStatus
  messages: CoachUIMessage[]
  connectionSummary: string | null
  challengeTool: CoachChallengeToolController
  sendPrompt: (prompt: string) => void
  startChallengeCreation: () => void
  stop: () => Promise<void>
  clearError: () => void
  resetConversation: () => void
  hydrateMessages: (nextMessages: CoachUIMessage[]) => void
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

function isPersistenceDegradationReason(
  value: string | null
): value is CoachPersistenceDegradationReason {
  return (
    value === "unauthenticated" ||
    value === "quota-exceeded" ||
    value === "upstream-error"
  )
}

function createCoachChatTransport(target: CoachTarget) {
  let persistence: CoachChatPersistenceAdapter | undefined
  let lastRequestEpoch = 0

  const transport = new DefaultChatTransport<CoachUIMessage>({
    api: "/api/coach",
    prepareSendMessagesRequest: ({ messages: outbound, body }) => {
      const baseBody = buildCoachRequestBody(target)
      const threadId = persistence?.getThreadId()
      return {
        body: {
          ...baseBody,
          ...body,
          ...(threadId ? { threadId } : {}),
          messages: sliceCoachMessageWindow(outbound),
        },
      }
    },
    fetch: async (input, init) => {
      const requestEpoch = persistence?.getSessionEpoch() ?? 0
      lastRequestEpoch = requestEpoch
      const response = await globalThis.fetch(input, init)
      if (persistence) {
        const resolvedThreadId = response.headers
          .get(COACH_THREAD_ID_HEADER)
          ?.trim()
        if (resolvedThreadId) {
          persistence.onThreadIdResolved(resolvedThreadId, requestEpoch)
        }
        const degradedHeader =
          response.headers.get(COACH_PERSISTENCE_HEADER)?.trim() ?? null
        if (isPersistenceDegradationReason(degradedHeader)) {
          persistence.onPersistenceDegraded(degradedHeader, requestEpoch)
        }
      }
      return response
    },
  })

  return {
    transport,
    setPersistence(next: CoachChatPersistenceAdapter | undefined) {
      persistence = next
    },
    notifyTurnFinished() {
      persistence?.onTurnFinished?.(lastRequestEpoch)
    },
  }
}

export function useCoachChat({
  chatId,
  target,
  persistence,
}: UseCoachChatOptions): UseCoachChatResult {
  const connection = useAIConnection()
  const connectionSummary = formatAIConnectionSummary(connection)

  const suppressAutoSendRef = React.useRef(false)

  const transportController = React.useMemo(
    () => createCoachChatTransport(target),
    [target]
  )

  React.useEffect(() => {
    transportController.setPersistence(persistence)
  }, [persistence, transportController])

  const {
    messages,
    status,
    error,
    sendMessage,
    addToolOutput,
    stop,
    setMessages,
    clearError,
  } = useChat<CoachUIMessage>({
    id: chatId,
    transport: transportController.transport,
    sendAutomaticallyWhen: ({ messages: nextMessages }) =>
      !suppressAutoSendRef.current &&
      lastAssistantMessageIsCompleteWithToolCalls({ messages: nextMessages }),
    onFinish: (event) => {
      if (!event.isAbort && !event.isError) {
        transportController.notifyTurnFinished()
      }
    },
  })

  const {
    controller: challengeTool,
    hasPendingToolCalls,
    cancelPendingToolCalls,
    resetToolState,
  } = useCoachChallengeTool({ addToolOutput })

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
      if (hasPendingToolCalls(messages)) {
        suppressAutoSendRef.current = true
        void cancelPendingToolCalls(messages)
          .finally(() => {
            suppressAutoSendRef.current = false
          })
          .then(() => {
            void sendMessage({ text: trimmed })
          })
        return
      }
      void sendMessage({ text: trimmed })
    },
    [
      cancelPendingToolCalls,
      clearError,
      connection.isConnected,
      hasPendingToolCalls,
      messages,
      sendMessage,
      status,
    ]
  )

  const startChallengeCreation = React.useCallback(() => {
    sendPrompt(CREATE_CHALLENGE_PROMPT)
  }, [sendPrompt])

  const hydrateMessages = React.useCallback(
    (nextMessages: CoachUIMessage[]) => {
      void stop()
      resetToolState()
      clearError()
      setMessages(nextMessages)
    },
    [clearError, resetToolState, setMessages, stop]
  )

  const resetConversation = React.useCallback(() => {
    hydrateMessages([])
  }, [hydrateMessages])

  return {
    state,
    messages,
    connectionSummary,
    challengeTool,
    sendPrompt,
    startChallengeCreation,
    stop,
    clearError,
    resetConversation,
    hydrateMessages,
  }
}
