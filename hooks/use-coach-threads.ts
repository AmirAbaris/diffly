"use client"

import * as React from "react"
import useSWR from "swr"
import { hydrateCoachThreadWithSequences } from "@/lib/ai/coach-window"
import type { CoachUIMessage } from "@/lib/ai/coach"
import { apiClient } from "@/lib/axios"
import type {
  CoachThreadDetail,
  CoachThreadListResponse,
  CoachThreadSummary,
  TruncateCoachMessagesResponse,
} from "@/types/coach-thread"

export const COACH_THREADS_SWR_KEY = "/api/user/coach-threads?limit=50"

export function isCoachThreadsKey(key: unknown): boolean {
  return (
    typeof key === "string" &&
    (key === "/api/user/coach-threads" ||
      key.startsWith("/api/user/coach-threads?") ||
      key.startsWith("/api/user/coach-threads/"))
  )
}

export interface FetchedCoachThread {
  thread: CoachThreadDetail
  messages: CoachUIMessage[]
  sequenceByMessageId: Record<string, number>
}

export function useCoachThreads() {
  const { data, error, isLoading, mutate } = useSWR<CoachThreadListResponse>(
    COACH_THREADS_SWR_KEY,
    {
      shouldRetryOnError: false,
    }
  )

  const items = React.useMemo(() => data?.items ?? [], [data])
  const total = data?.total ?? items.length

  const fetchThread = React.useCallback(
    async (
      threadId: string,
      options?: { signal?: AbortSignal }
    ): Promise<FetchedCoachThread> => {
      const response = await apiClient.get<CoachThreadDetail>(
        `/api/user/coach-threads/${encodeURIComponent(threadId)}`,
        { signal: options?.signal }
      )
      const hydrated = hydrateCoachThreadWithSequences(response.data.messages)
      return {
        thread: response.data,
        messages: hydrated.messages,
        sequenceByMessageId: hydrated.sequenceByMessageId,
      }
    },
    []
  )

  const truncateMessages = React.useCallback(
    async (
      threadId: string,
      fromSequence: number
    ): Promise<TruncateCoachMessagesResponse> => {
      const response = await apiClient.delete<TruncateCoachMessagesResponse>(
        `/api/user/coach-threads/${encodeURIComponent(threadId)}/messages?from_sequence=${encodeURIComponent(String(fromSequence))}`
      )
      return response.data
    },
    []
  )

  const renameThread = React.useCallback(
    async (threadId: string, title: string): Promise<CoachThreadSummary> => {
      const trimmed = title.trim()
      let updated: CoachThreadSummary | null = null

      await mutate(
        async (current) => {
          const response = await apiClient.patch<CoachThreadSummary>(
            `/api/user/coach-threads/${encodeURIComponent(threadId)}`,
            { title: trimmed }
          )
          updated = response.data
          if (!current) {
            return { items: [response.data], total: 1 }
          }
          return {
            ...current,
            items: current.items.map((item) =>
              item.id === threadId ? response.data : item
            ),
          }
        },
        {
          optimisticData: (current) => {
            if (!current) return { items: [], total: 0 }
            return {
              ...current,
              items: current.items.map((item) =>
                item.id === threadId ? { ...item, title: trimmed } : item
              ),
            }
          },
          rollbackOnError: true,
          revalidate: false,
        }
      )

      if (!updated) {
        throw new Error("Failed to rename conversation")
      }
      return updated
    },
    [mutate]
  )

  const deleteThread = React.useCallback(
    async (threadId: string): Promise<void> => {
      await mutate(
        async (current) => {
          await apiClient.delete(
            `/api/user/coach-threads/${encodeURIComponent(threadId)}`
          )
          if (!current) return { items: [], total: 0 }
          const nextItems = current.items.filter((item) => item.id !== threadId)
          return {
            items: nextItems,
            total: Math.max(0, current.total - 1),
          }
        },
        {
          optimisticData: (current) => {
            if (!current) return { items: [], total: 0 }
            const nextItems = current.items.filter(
              (item) => item.id !== threadId
            )
            return {
              items: nextItems,
              total: Math.max(0, current.total - 1),
            }
          },
          rollbackOnError: true,
          revalidate: false,
        }
      )
    },
    [mutate]
  )

  const revalidate = React.useCallback(async () => {
    await mutate()
  }, [mutate])

  return {
    items,
    total,
    isLoading,
    error: error ?? null,
    fetchThread,
    truncateMessages,
    renameThread,
    deleteThread,
    revalidate,
  }
}
