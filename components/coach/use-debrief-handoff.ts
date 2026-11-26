"use client"

import * as React from "react"
import axios from "axios"
import { useRouter } from "next/navigation"
import { useSWRConfig } from "swr"
import { isCoachThreadsKey } from "@/hooks/use-coach-threads"
import type { CoachUIMessage } from "@/lib/ai/coach"
import {
  buildDebriefHandoffPrompt,
  buildDebriefHandoffTitle,
  chunkMessagesForAppend,
  sanitizeChallengeSlug,
  serializeCoachMessagesForAppend,
} from "@/lib/ai/coach-serialize"
import { apiClient } from "@/lib/axios"
import type { CoachThreadSummary } from "@/types/coach-thread"

export type DebriefHandoffErrorKind =
  "unauthenticated" | "quota-exceeded" | "validation" | "network"

export type DebriefHandoffState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; errorKind: DebriefHandoffErrorKind; message: string }

function classifyHandoffError(err: unknown): {
  errorKind: DebriefHandoffErrorKind
  message: string
} {
  const status = axios.isAxiosError(err) ? err.response?.status : undefined
  if (status === 401) {
    return {
      errorKind: "unauthenticated",
      message: "Sign in to save this debrief conversation in Coach.",
    }
  }
  if (status === 409) {
    return {
      errorKind: "quota-exceeded",
      message:
        "Saved conversation limit reached. Delete an older thread in Coach to save this debrief.",
    }
  }
  if (status === 422) {
    return {
      errorKind: "validation",
      message: "Some messages in this debrief could not be saved. Try again.",
    }
  }
  return {
    errorKind: "network",
    message: "Could not hand off this debrief to Coach. Please try again.",
  }
}

export interface UseDebriefHandoffOptions {
  challengeSlug: string
  challengeTitle?: string
}

export function useDebriefHandoff({
  challengeSlug,
  challengeTitle,
}: UseDebriefHandoffOptions) {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const [state, setState] = React.useState<DebriefHandoffState>({
    kind: "idle",
  })
  const inFlightRef = React.useRef(false)

  const clearError = React.useCallback(() => {
    setState((prev) => (prev.kind === "error" ? { kind: "idle" } : prev))
  }, [])

  const handoffToCoach = React.useCallback(
    async (messages: readonly CoachUIMessage[], isStreaming: boolean) => {
      if (isStreaming || inFlightRef.current) return

      const persistable = serializeCoachMessagesForAppend(messages)
      if (persistable.length === 0) {
        const prompt = buildDebriefHandoffPrompt(challengeSlug, challengeTitle)
        router.push(`/coach?prompt=${encodeURIComponent(prompt)}`)
        return
      }

      inFlightRef.current = true
      setState({ kind: "submitting" })
      let createdThreadId: string | null = null

      try {
        const safeSlug = sanitizeChallengeSlug(challengeSlug)
        const title = buildDebriefHandoffTitle(challengeTitle, challengeSlug)
        const createRes = await apiClient.post<CoachThreadSummary>(
          "/api/user/coach-threads",
          {
            mode: "debrief",
            title,
            ...(safeSlug ? { challenge_slug: safeSlug } : {}),
          }
        )
        createdThreadId = createRes.data.id

        const chunks = chunkMessagesForAppend(persistable)
        const threadMessagesUrl = `/api/user/coach-threads/${encodeURIComponent(createdThreadId)}/messages`
        await chunks.reduce<Promise<void>>(
          (chain, chunk) =>
            chain.then(async () => {
              await apiClient.post(threadMessagesUrl, { messages: chunk })
            }),
          Promise.resolve()
        )

        void mutate(isCoachThreadsKey)
        setState({ kind: "idle" })
        router.push(`/coach?thread=${encodeURIComponent(createdThreadId)}`)
      } catch (err: unknown) {
        if (createdThreadId) {
          await apiClient
            .delete(
              `/api/user/coach-threads/${encodeURIComponent(createdThreadId)}`
            )
            .catch(() => undefined)
        }
        const classified = classifyHandoffError(err)
        setState({
          kind: "error",
          errorKind: classified.errorKind,
          message: classified.message,
        })
      } finally {
        inFlightRef.current = false
      }
    },
    [challengeSlug, challengeTitle, mutate, router]
  )

  return {
    state,
    isSubmitting: state.kind === "submitting",
    handoffToCoach,
    clearError,
  }
}
