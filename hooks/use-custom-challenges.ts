"use client"

import * as React from "react"
import axios from "axios"
import useSWR, { useSWRConfig } from "swr"
import { apiClient } from "@/lib/axios"
import type {
  CustomChallengeResponse,
  CustomChallengesListResponse,
  GenerateCustomChallengePayload,
  ShareChallengeResponse,
} from "@/types/challenge"

export const CUSTOM_CHALLENGES_SWR_KEY = "/api/challenges/custom"
export const GEMINI_API_KEY_STORAGE_KEY = "diffly_gemini_key"
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

export function getStoredGeminiKey(): string {
  if (typeof window === "undefined") {
    return ""
  }
  try {
    return window.localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY)?.trim() ?? ""
  } catch {
    return ""
  }
}

export function setStoredGeminiKey(key: string, remember: boolean): void {
  if (typeof window === "undefined") {
    return
  }
  try {
    if (remember && key.trim()) {
      window.localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, key.trim())
    } else {
      window.localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY)
    }
  } catch {}
}

function isChallengeDetailKey(key: unknown, slug: string): boolean {
  return (
    typeof key === "string" &&
    (key === `/api/challenges/${slug}` ||
      key.startsWith(`/api/challenges/${slug}?`))
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
      await revalidateCustomLibrary()
      void cacheMutate("/api/challenges")
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
      payload: GenerateCustomChallengePayload,
      apiKey: string
    ): Promise<CustomChallengeResponse> => {
      const trimmedKey = apiKey.trim()
      setQuotaSyncState("idle")
      try {
        const response = await apiClient.post<CustomChallengeResponse>(
          "/api/challenges/generate-custom",
          payload,
          {
            timeout: CUSTOM_CHALLENGE_GENERATE_TIMEOUT_MS,
            headers: {
              "X-Gemini-Key": trimmedKey,
            },
          }
        )
        await revalidateCustomLibrary()
        void cacheMutate("/api/challenges")
        return response.data
      } catch (err: unknown) {
        if (isRequestTimeoutError(err)) {
          setQuotaSyncState("syncing")
          try {
            await Promise.all([
              revalidateCustomLibrary(),
              cacheMutate("/api/challenges"),
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
