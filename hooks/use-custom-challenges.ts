"use client"

import * as React from "react"
import axios from "axios"
import useSWR, { useSWRConfig } from "swr"
import { AI_CONNECTION_SWR_KEY } from "@/hooks/use-ai-connection"
import { apiClient } from "@/lib/axios"
import type {
  CustomChallengeResponse,
  CustomChallengesListResponse,
  GenerateCustomChallengePayload,
  ShareChallengeResponse,
} from "@/types/challenge"

export const CUSTOM_CHALLENGES_SWR_KEY = "/api/challenges/custom"
export const CUSTOM_CHALLENGE_GENERATE_TIMEOUT_MS = 60_000

export type QuotaSyncState = "idle" | "syncing" | "synced" | "error"

export function isRequestTimeoutError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) {
    return false
  }
  if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
    return true
  }
  if (err.response?.status === 408 || err.response?.status === 504) {
    return true
  }
  return err.message.toLowerCase().includes("timeout")
}

function isCatalogChallengesKey(key: unknown): boolean {
  return (
    typeof key === "string" &&
    (key === "/api/challenges" || key.startsWith("/api/challenges?"))
  )
}

function isChallengeDetailKey(key: unknown, slug: string): boolean {
  return (
    typeof key === "string" &&
    (key === `/api/challenges/${slug}` ||
      key.startsWith(`/api/challenges/${slug}?`))
  )
}

function isCoachPatternsKey(key: unknown): boolean {
  return (
    typeof key === "string" &&
    (key === "/api/user/coach-patterns" ||
      key.startsWith("/api/user/coach-patterns?"))
  )
}

function isUserStatsKey(key: unknown): boolean {
  return (
    typeof key === "string" &&
    (key.startsWith("/api/user/progress") ||
      key.startsWith("/api/user/analytics") ||
      key.startsWith("/api/challenges/next"))
  )
}

export function useCustomChallenges(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true
  const { mutate: cacheMutate } = useSWRConfig()
  const { data, error, isLoading, isValidating, mutate } =
    useSWR<CustomChallengesListResponse>(
      enabled ? CUSTOM_CHALLENGES_SWR_KEY : null
    )
  const [quotaSyncState, setQuotaSyncState] =
    React.useState<QuotaSyncState>("idle")

  const customChallenges = React.useMemo(() => data?.items ?? [], [data])
  const total = data?.total ?? customChallenges.length
  const quotaLimit = data?.quota_limit ?? 5
  const quotaRemaining =
    data?.quota_remaining ?? Math.max(0, quotaLimit - total)
  const isQuotaFull = total >= quotaLimit

  const resetQuotaSyncState = React.useCallback(() => {
    setQuotaSyncState("idle")
  }, [])

  const revalidateCustomLibrary = React.useCallback(async () => {
    if (enabled) {
      await mutate()
      return
    }
    await cacheMutate(CUSTOM_CHALLENGES_SWR_KEY)
  }, [enabled, mutate, cacheMutate])

  const deleteCustomChallenge = React.useCallback(
    async (identifier: string | number) => {
      const response = await apiClient.delete(
        `/api/challenges/custom/${identifier}`
      )
      await Promise.all([
        revalidateCustomLibrary(),
        cacheMutate(isCoachPatternsKey),
      ])
      void cacheMutate(isCatalogChallengesKey)
      void cacheMutate(isUserStatsKey)
      return response.data
    },
    [revalidateCustomLibrary, cacheMutate]
  )

  const toggleChallengeShare = React.useCallback(
    async (
      identifier: string | number,
      shareEnabled: boolean,
      regenerate = false
    ): Promise<ShareChallengeResponse> => {
      const response = await apiClient.patch<ShareChallengeResponse>(
        `/api/challenges/custom/${identifier}/share`,
        { enabled: shareEnabled, regenerate }
      )
      const slug = response.data.slug
      await Promise.all([
        revalidateCustomLibrary(),
        slug
          ? cacheMutate((key) => isChallengeDetailKey(key, slug))
          : Promise.resolve(),
      ])
      return response.data
    },
    [revalidateCustomLibrary, cacheMutate]
  )

  const generateCustomChallenge = React.useCallback(
    async (
      payload: GenerateCustomChallengePayload
    ): Promise<CustomChallengeResponse> => {
      setQuotaSyncState("idle")
      try {
        const response = await apiClient.post<CustomChallengeResponse>(
          "/api/ai/challenges/generate",
          payload,
          {
            timeout: CUSTOM_CHALLENGE_GENERATE_TIMEOUT_MS,
          }
        )
        await revalidateCustomLibrary()
        void cacheMutate(isCatalogChallengesKey)
        return response.data
      } catch (err: unknown) {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          void cacheMutate(AI_CONNECTION_SWR_KEY)
        }
        if (isRequestTimeoutError(err)) {
          setQuotaSyncState("syncing")
          try {
            await Promise.all([
              revalidateCustomLibrary(),
              cacheMutate(isCatalogChallengesKey),
            ])
            setQuotaSyncState("synced")
          } catch {
            setQuotaSyncState("error")
          }
        }
        throw err
      }
    },
    [revalidateCustomLibrary, cacheMutate]
  )

  return {
    customChallenges,
    total,
    quotaLimit,
    quotaRemaining,
    isQuotaFull,
    isLoading,
    isValidating,
    quotaSyncState,
    isSyncingQuota: quotaSyncState === "syncing",
    resetQuotaSyncState,
    error,
    mutate,
    deleteCustomChallenge,
    toggleChallengeShare,
    generateCustomChallenge,
  }
}
