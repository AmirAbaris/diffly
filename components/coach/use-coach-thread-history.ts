"use client"

import * as React from "react"
import axios from "axios"
import type {
  CoachHistoryMutationParams,
  CoachHistoryMutationResult,
} from "@/components/coach/coach-chat-transport"
import type { FetchedCoachThread } from "@/hooks/use-coach-threads"
import type { CoachUIMessage } from "@/lib/ai/coach"
import type {
  CoachPersistenceDegradationReason,
  CoachPersistenceNotice,
  TruncateCoachMessagesResponse,
} from "@/types/coach-thread"

export function buildPersistenceNotice(
  reason: CoachPersistenceDegradationReason
): CoachPersistenceNotice {
  if (reason === "unauthenticated") {
    return {
      reason,
      message:
        "Sign in to save Coach conversations across devices and sessions.",
    }
  }
  if (reason === "quota-exceeded") {
    return {
      reason,
      message:
        "Saved conversation limit reached. This chat is temporary until you delete an older thread.",
    }
  }
  return {
    reason,
    message:
      "Conversation history is temporarily unavailable. This chat will not be saved.",
  }
}

export function getThreadLoadError(err: unknown): {
  status?: number
  message: string
} {
  const status = axios.isAxiosError(err) ? err.response?.status : undefined
  if (status === 404) {
    return {
      status,
      message:
        "This conversation could not be found. It may have been deleted.",
    }
  }
  if (status === 401 || status === 403) {
    return {
      status,
      message: "You do not have access to this conversation.",
    }
  }
  return {
    status,
    message: "Unable to load this conversation right now.",
  }
}

export interface UseCoachThreadHistoryOptions {
  getThreadId: () => string | null
  getSessionEpoch: () => number
  fetchThread: (
    threadId: string,
    options?: { signal?: AbortSignal }
  ) => Promise<FetchedCoachThread>
  truncateMessages: (
    threadId: string,
    fromSequence: number
  ) => Promise<TruncateCoachMessagesResponse>
  revalidate: () => Promise<void>
}

function formatHistoryMutationError(err: unknown): string {
  const status = axios.isAxiosError(err) ? err.response?.status : undefined
  if (status === 404) {
    return "This conversation could not be found."
  }
  if (status === 401 || status === 403) {
    return "Sign in to modify saved conversations."
  }
  return "Could not update conversation history. Please try again."
}

function resolveFallbackSequence(
  targetMessageId: string,
  messagesSnapshot: readonly CoachUIMessage[],
  sequenceById: Map<string, number>
): number | null {
  const targetIndex = messagesSnapshot.findIndex(
    (msg) => msg.id === targetMessageId
  )
  if (targetIndex === -1) return null

  let earliestLater: number | null = null
  for (let i = targetIndex + 1; i < messagesSnapshot.length; i += 1) {
    const seq = sequenceById.get(messagesSnapshot[i].id)
    if (seq !== undefined && (earliestLater === null || seq < earliestLater)) {
      earliestLater = seq
    }
  }
  if (earliestLater !== null) {
    return earliestLater
  }

  let latestEarlier: number | null = null
  for (let i = targetIndex - 1; i >= 0; i -= 1) {
    const seq = sequenceById.get(messagesSnapshot[i].id)
    if (seq !== undefined) {
      latestEarlier = seq
      break
    }
  }

  if (latestEarlier !== null) {
    for (const seq of sequenceById.values()) {
      if (seq > latestEarlier) {
        return latestEarlier + 1
      }
    }
    return null
  }

  return sequenceById.size > 0 ? 0 : null
}

export function useCoachThreadHistory({
  getThreadId,
  getSessionEpoch,
  fetchThread,
  truncateMessages,
  revalidate,
}: UseCoachThreadHistoryOptions) {
  const sequenceByIdRef = React.useRef<Map<string, number>>(new Map())

  const setSequences = React.useCallback(
    (sequenceByMessageId?: Record<string, number>) => {
      const next = new Map<string, number>()
      if (sequenceByMessageId) {
        for (const [id, seq] of Object.entries(sequenceByMessageId)) {
          next.set(id, seq)
        }
      }
      sequenceByIdRef.current = next
    },
    []
  )

  const clearSequences = React.useCallback(() => {
    sequenceByIdRef.current = new Map()
  }, [])

  const prepareHistoryMutation = React.useCallback(
    async ({
      targetMessageId,
      messagesSnapshot,
      requestEpoch,
    }: CoachHistoryMutationParams): Promise<CoachHistoryMutationResult> => {
      if (requestEpoch !== getSessionEpoch()) {
        return { ok: false, error: "Conversation changed before updating." }
      }

      const threadId = getThreadId()
      if (!threadId) {
        return { ok: true }
      }

      try {
        let fromSequence = sequenceByIdRef.current.get(targetMessageId)

        if (fromSequence === undefined) {
          const fetched = await fetchThread(threadId)
          if (requestEpoch !== getSessionEpoch()) {
            return { ok: false, error: "Conversation changed before updating." }
          }
          setSequences(fetched.sequenceByMessageId)
          fromSequence = sequenceByIdRef.current.get(targetMessageId)
        }

        if (fromSequence === undefined) {
          const fallback = resolveFallbackSequence(
            targetMessageId,
            messagesSnapshot,
            sequenceByIdRef.current
          )
          if (fallback === null) {
            return { ok: true }
          }
          fromSequence = fallback
        }

        await truncateMessages(threadId, fromSequence)

        if (requestEpoch !== getSessionEpoch()) {
          return { ok: false, error: "Conversation changed before updating." }
        }

        for (const [id, seq] of sequenceByIdRef.current.entries()) {
          if (seq >= fromSequence) {
            sequenceByIdRef.current.delete(id)
          }
        }
        void revalidate()
        return { ok: true }
      } catch (err: unknown) {
        return { ok: false, error: formatHistoryMutationError(err) }
      }
    },
    [
      fetchThread,
      getSessionEpoch,
      getThreadId,
      revalidate,
      setSequences,
      truncateMessages,
    ]
  )

  return {
    setSequences,
    clearSequences,
    prepareHistoryMutation,
  }
}
