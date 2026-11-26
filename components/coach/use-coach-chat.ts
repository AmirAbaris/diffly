"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai"
import {
  CREATE_CHALLENGE_PROMPT,
  createCoachChatTransport,
  type CoachChatPersistenceAdapter,
  type CoachHistoryMutationResult,
  type CoachTarget,
} from "@/components/coach/coach-chat-transport"
import {
  useCoachChallengeTool,
  type CoachChallengeToolController,
} from "@/components/coach/use-coach-challenge-tool"
import {
  useCoachMessageActions,
  type CoachChatMutatingAction,
} from "@/components/coach/use-coach-message-actions"
import { useAIConnection } from "@/hooks/use-ai-connection"
import { formatAIConnectionSummary } from "@/lib/ai/catalog"
import { parseCoachErrorMessage, type CoachUIMessage } from "@/lib/ai/coach"

export {
  CREATE_CHALLENGE_PROMPT,
  DEBRIEF_QUICK_PROMPTS,
  PATTERNS_QUICK_PROMPTS,
  type CoachChatPersistenceAdapter,
  type CoachHistoryMutationParams,
  type CoachHistoryMutationResult,
  type CoachQuickPrompt,
  type CoachTarget,
} from "@/components/coach/coach-chat-transport"
export type { CoachChatMutatingAction } from "@/components/coach/use-coach-message-actions"

export type CoachChatStatus =
  | { kind: "checking-connection" }
  | { kind: "disconnected" }
  | { kind: "streaming"; phase: "submitted" | "streaming" }
  | { kind: "error"; message: string; isAuthError: boolean }
  | { kind: "ready" }

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
  mutatingAction: CoachChatMutatingAction
  actionError: string | null
  clearActionError: () => void
  sendPrompt: (prompt: string) => void
  startChallengeCreation: () => void
  regenerateLastReply: () => Promise<CoachHistoryMutationResult>
  editAndResendMessage: (
    messageId: string,
    nextText: string
  ) => Promise<CoachHistoryMutationResult>
  stop: () => Promise<void>
  clearError: () => void
  resetConversation: () => void
  hydrateMessages: (nextMessages: CoachUIMessage[]) => void
}

const AUTH_ERROR_PATTERN =
  /\b401\b|unauthorized|no active ai provider|authentication failed|not connected/i

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
    regenerate,
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

  const isStreaming = status === "submitted" || status === "streaming"

  const {
    mutatingAction,
    actionError,
    clearActionError,
    regenerateLastReply,
    editAndResendMessage,
  } = useCoachMessageActions({
    messages,
    isConnected: connection.isConnected,
    isStreaming,
    persistence,
    suppressAutoSendRef,
    hasPendingToolCalls,
    cancelPendingToolCalls,
    clearError,
    resetToolState,
    setMessages,
    sendMessage,
    regenerate,
  })

  const state: CoachChatStatus = React.useMemo(() => {
    if (connection.isLoading) return { kind: "checking-connection" }
    if (!connection.isConnected) return { kind: "disconnected" }
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
      if (!trimmed || !connection.isConnected || isStreaming) {
        return
      }
      clearActionError()
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
      clearActionError,
      clearError,
      connection.isConnected,
      hasPendingToolCalls,
      isStreaming,
      messages,
      sendMessage,
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
      clearActionError()
      setMessages(nextMessages)
    },
    [clearActionError, clearError, resetToolState, setMessages, stop]
  )

  const resetConversation = React.useCallback(() => {
    hydrateMessages([])
  }, [hydrateMessages])

  return {
    state,
    messages,
    connectionSummary,
    challengeTool,
    mutatingAction,
    actionError,
    clearActionError,
    sendPrompt,
    startChallengeCreation,
    regenerateLastReply,
    editAndResendMessage,
    stop,
    clearError,
    resetConversation,
    hydrateMessages,
  }
}
