"use client"

import * as React from "react"
import axios from "axios"
import { useSearchParams } from "next/navigation"
import {
  useCoachChat,
  type CoachChatPersistenceAdapter,
  type CoachTarget,
  type UseCoachChatResult,
} from "@/components/coach/use-coach-chat"
import { useAuth } from "@/hooks/use-auth"
import { useCoachThreads } from "@/hooks/use-coach-threads"
import type {
  CoachPersistenceDegradationReason,
  CoachPersistenceNotice,
  CoachThreadSessionState,
  CoachThreadSummary,
} from "@/types/coach-thread"

const WORKSPACE_TARGET: CoachTarget = {
  mode: "patterns",
  sliceLimit: 5,
  missedLimit: 10,
}

function buildPersistenceNotice(
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

function getThreadLoadError(err: unknown): {
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

export interface UseCoachWorkspaceSessionResult {
  chat: UseCoachChatResult
  sessionState: CoachThreadSessionState
  activeThreadId: string | null
  persistenceNotice: CoachPersistenceNotice | null
  threads: CoachThreadSummary[]
  threadsLoading: boolean
  selectThread: (threadId: string) => void
  startNewChat: () => void
  retryLoadThread: () => void
  renameThread: (threadId: string, title: string) => Promise<CoachThreadSummary>
  deleteThread: (threadId: string) => Promise<void>
  dismissPersistenceNotice: () => void
}

export function useCoachWorkspaceSession(): UseCoachWorkspaceSessionResult {
  const searchParams = useSearchParams()
  const auth = useAuth()
  const {
    items: threads,
    isLoading: threadsLoading,
    fetchThread,
    renameThread,
    deleteThread: removeThread,
    revalidate,
  } = useCoachThreads()

  const [sessionState, setSessionState] =
    React.useState<CoachThreadSessionState>({ kind: "fresh" })
  const [persistenceNotice, setPersistenceNotice] =
    React.useState<CoachPersistenceNotice | null>(null)

  const activeThreadIdRef = React.useRef<string | null>(null)
  const sessionEpochRef = React.useRef(0)
  const loadAbortRef = React.useRef<AbortController | null>(null)
  const consumedPromptRef = React.useRef<string | null>(null)
  const lastActorKeyRef = React.useRef<string | null>(null)

  const persistence = React.useMemo<CoachChatPersistenceAdapter>(
    () => ({
      getThreadId: () => activeThreadIdRef.current,
      getSessionEpoch: () => sessionEpochRef.current,
      onThreadIdResolved: (threadId, requestEpoch) => {
        if (requestEpoch !== sessionEpochRef.current) return
        if (activeThreadIdRef.current !== threadId) {
          activeThreadIdRef.current = threadId
          setPersistenceNotice(null)
          setSessionState({ kind: "active", threadId })
          if (typeof window !== "undefined") {
            window.history.replaceState(
              window.history.state,
              "",
              `/coach?thread=${encodeURIComponent(threadId)}`
            )
          }
        }
      },
      onPersistenceDegraded: (reason, requestEpoch) => {
        if (requestEpoch !== sessionEpochRef.current) return
        setSessionState({ kind: "ephemeral", reason })
        setPersistenceNotice(buildPersistenceNotice(reason))
      },
      onTurnFinished: (requestEpoch) => {
        if (requestEpoch !== sessionEpochRef.current) return
        void revalidate()
      },
    }),
    [revalidate]
  )

  const chat = useCoachChat({
    chatId: "coach-workspace",
    target: WORKSPACE_TARGET,
    persistence,
  })
  const { hydrateMessages, sendPrompt, state: chatState } = chat

  const resetToFreshDraft = React.useCallback(
    (updateUrl: boolean) => {
      sessionEpochRef.current += 1
      loadAbortRef.current?.abort()
      loadAbortRef.current = null
      activeThreadIdRef.current = null
      setPersistenceNotice(null)
      setSessionState({ kind: "fresh" })
      hydrateMessages([])
      if (updateUrl && typeof window !== "undefined") {
        window.history.replaceState(window.history.state, "", "/coach")
      }
    },
    [hydrateMessages]
  )

  const loadThreadById = React.useCallback(
    (threadId: string) => {
      sessionEpochRef.current += 1
      const epoch = sessionEpochRef.current
      loadAbortRef.current?.abort()
      const controller = new AbortController()
      loadAbortRef.current = controller
      activeThreadIdRef.current = threadId
      setPersistenceNotice(null)
      setSessionState({ kind: "loading", threadId })
      hydrateMessages([])

      void fetchThread(threadId, { signal: controller.signal })
        .then(({ thread, messages }) => {
          if (epoch !== sessionEpochRef.current || controller.signal.aborted) {
            return
          }
          hydrateMessages(messages)
          setSessionState({ kind: "active", threadId: thread.id })
        })
        .catch((err: unknown) => {
          if (epoch !== sessionEpochRef.current || controller.signal.aborted) {
            return
          }
          const { status, message } = getThreadLoadError(err)
          setSessionState({ kind: "error", threadId, status, message })
        })
    },
    [fetchThread, hydrateMessages]
  )

  const selectThread = React.useCallback(
    (threadId: string) => {
      if (
        threadId === activeThreadIdRef.current &&
        sessionState.kind === "active"
      ) {
        return
      }
      if (typeof window !== "undefined") {
        window.history.pushState(
          window.history.state,
          "",
          `/coach?thread=${encodeURIComponent(threadId)}`
        )
      }
      loadThreadById(threadId)
    },
    [loadThreadById, sessionState.kind]
  )

  const startNewChat = React.useCallback(() => {
    resetToFreshDraft(true)
  }, [resetToFreshDraft])

  const retryLoadThread = React.useCallback(() => {
    if (sessionState.kind === "error") {
      loadThreadById(sessionState.threadId)
    }
  }, [loadThreadById, sessionState])

  const deleteThread = React.useCallback(
    async (threadId: string) => {
      await removeThread(threadId)
      if (activeThreadIdRef.current === threadId) {
        resetToFreshDraft(true)
      }
    },
    [removeThread, resetToFreshDraft]
  )

  const dismissPersistenceNotice = React.useCallback(() => {
    setPersistenceNotice(null)
  }, [])

  const urlThreadId = searchParams.get("thread")?.trim() || null
  const initialPrompt = searchParams.get("prompt")?.trim() || ""

  React.useEffect(() => {
    if (urlThreadId && urlThreadId !== activeThreadIdRef.current) {
      loadThreadById(urlThreadId)
    }
  }, [loadThreadById, urlThreadId])

  React.useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)
      const nextThreadId = params.get("thread")?.trim() || null
      if (nextThreadId) {
        if (nextThreadId !== activeThreadIdRef.current) {
          loadThreadById(nextThreadId)
        }
      } else if (activeThreadIdRef.current !== null) {
        resetToFreshDraft(false)
      }
    }
    window.addEventListener("popstate", handlePopState)
    return () => {
      window.removeEventListener("popstate", handlePopState)
    }
  }, [loadThreadById, resetToFreshDraft])

  React.useEffect(() => {
    if (
      initialPrompt &&
      chatState.kind === "ready" &&
      consumedPromptRef.current !== initialPrompt
    ) {
      consumedPromptRef.current = initialPrompt
      if (activeThreadIdRef.current !== null) {
        resetToFreshDraft(false)
      }
      window.history.replaceState(window.history.state, "", "/coach")
      sendPrompt(initialPrompt)
    }
  }, [chatState.kind, initialPrompt, resetToFreshDraft, sendPrompt])

  React.useEffect(() => {
    if (auth.isLoading) return
    const actorKey = auth.user ? String(auth.user.id) : "guest"
    if (lastActorKeyRef.current === null) {
      lastActorKeyRef.current = actorKey
      return
    }
    if (lastActorKeyRef.current !== actorKey) {
      lastActorKeyRef.current = actorKey
      resetToFreshDraft(true)
    }
  }, [auth.isLoading, auth.user, resetToFreshDraft])

  React.useEffect(() => {
    return () => {
      loadAbortRef.current?.abort()
    }
  }, [])

  const activeThreadId =
    sessionState.kind === "active" ||
    sessionState.kind === "loading" ||
    sessionState.kind === "error"
      ? sessionState.threadId
      : null

  return {
    chat,
    sessionState,
    activeThreadId,
    persistenceNotice,
    threads,
    threadsLoading,
    selectThread,
    startNewChat,
    retryLoadThread,
    renameThread,
    deleteThread,
    dismissPersistenceNotice,
  }
}
