"use client"

import * as React from "react"
import type {
  CoachChatPersistenceAdapter,
  CoachHistoryMutationResult,
} from "@/components/coach/coach-chat-transport"
import { COACH_MAX_TEXT_PART_CHARS, type CoachUIMessage } from "@/lib/ai/coach"

export type CoachChatMutatingAction =
  | { kind: "idle" }
  | { kind: "regenerating" }
  | { kind: "editing"; messageId: string }

export interface UseCoachMessageActionsOptions {
  messages: CoachUIMessage[]
  isConnected: boolean
  isStreaming: boolean
  persistence?: CoachChatPersistenceAdapter
  suppressAutoSendRef: React.RefObject<boolean>
  hasPendingToolCalls: (messages: CoachUIMessage[]) => boolean
  cancelPendingToolCalls: (messages: CoachUIMessage[]) => Promise<void>
  clearError: () => void
  resetToolState: () => void
  setMessages: (messages: CoachUIMessage[]) => void
  sendMessage: (message: { text: string }) => Promise<void>
  regenerate: (options?: { messageId?: string }) => Promise<void>
}

export function useCoachMessageActions({
  messages,
  isConnected,
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
}: UseCoachMessageActionsOptions) {
  const mutatingRef = React.useRef(false)
  const [mutatingAction, setMutatingAction] =
    React.useState<CoachChatMutatingAction>({ kind: "idle" })
  const [actionError, setActionError] = React.useState<string | null>(null)

  const clearActionError = React.useCallback(() => {
    setActionError(null)
  }, [])

  const regenerateLastReply =
    React.useCallback(async (): Promise<CoachHistoryMutationResult> => {
      if (isStreaming || mutatingRef.current || !isConnected) {
        return { ok: false }
      }
      const lastIndex = messages.length - 1
      const lastMsg = lastIndex >= 0 ? messages[lastIndex] : undefined
      if (
        !lastMsg ||
        lastMsg.role !== "assistant" ||
        !messages.slice(0, lastIndex).some((m) => m.role === "user")
      ) {
        return { ok: false }
      }

      mutatingRef.current = true
      setMutatingAction({ kind: "regenerating" })
      setActionError(null)
      const snapshot = messages
      const requestEpoch = persistence?.getSessionEpoch() ?? 0

      try {
        if (persistence?.prepareHistoryMutation) {
          const mutation = await persistence.prepareHistoryMutation({
            targetMessageId: lastMsg.id,
            messagesSnapshot: snapshot,
            requestEpoch,
          })
          if (persistence.getSessionEpoch() !== requestEpoch) {
            return { ok: false }
          }
          if (!mutation.ok) {
            const msg = mutation.error ?? "Could not regenerate response."
            setActionError(msg)
            return { ok: false, error: msg }
          }
        }

        clearError()
        resetToolState()
        void regenerate({ messageId: lastMsg.id })
        return { ok: true }
      } finally {
        mutatingRef.current = false
        setMutatingAction({ kind: "idle" })
      }
    }, [
      clearError,
      isConnected,
      isStreaming,
      messages,
      persistence,
      regenerate,
      resetToolState,
    ])

  const editAndResendMessage = React.useCallback(
    async (
      messageId: string,
      nextText: string
    ): Promise<CoachHistoryMutationResult> => {
      const trimmed = nextText.trim()
      if (!trimmed) {
        return { ok: false, error: "Message cannot be empty." }
      }
      if (trimmed.length > COACH_MAX_TEXT_PART_CHARS) {
        return {
          ok: false,
          error: `Message must be ${COACH_MAX_TEXT_PART_CHARS.toLocaleString()} characters or fewer.`,
        }
      }
      if (isStreaming || mutatingRef.current || !isConnected) {
        return { ok: false }
      }

      const userIndex = messages.findIndex(
        (m) => m.id === messageId && m.role === "user"
      )
      if (userIndex === -1) {
        return { ok: false, error: "Message not found." }
      }

      mutatingRef.current = true
      setMutatingAction({ kind: "editing", messageId })
      setActionError(null)
      const snapshot = messages
      const requestEpoch = persistence?.getSessionEpoch() ?? 0

      try {
        if (persistence?.prepareHistoryMutation) {
          const mutation = await persistence.prepareHistoryMutation({
            targetMessageId: messageId,
            messagesSnapshot: snapshot,
            requestEpoch,
          })
          if (persistence.getSessionEpoch() !== requestEpoch) {
            return { ok: false }
          }
          if (!mutation.ok) {
            return {
              ok: false,
              error: mutation.error ?? "Could not update message.",
            }
          }
        }

        clearError()
        resetToolState()
        const prefix = snapshot.slice(0, userIndex)
        if (hasPendingToolCalls(prefix)) {
          suppressAutoSendRef.current = true
          try {
            await cancelPendingToolCalls(prefix)
          } finally {
            suppressAutoSendRef.current = false
          }
        }
        setMessages(prefix)
        void sendMessage({ text: trimmed })
        return { ok: true }
      } finally {
        mutatingRef.current = false
        setMutatingAction({ kind: "idle" })
      }
    },
    [
      cancelPendingToolCalls,
      clearError,
      hasPendingToolCalls,
      isConnected,
      isStreaming,
      messages,
      persistence,
      resetToolState,
      sendMessage,
      setMessages,
      suppressAutoSendRef,
    ]
  )

  return {
    mutatingAction,
    actionError,
    clearActionError,
    regenerateLastReply,
    editAndResendMessage,
  }
}
