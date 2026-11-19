"use client"

import * as React from "react"
import useSWR, { mutate as globalMutate } from "swr"
import { apiClient } from "@/lib/axios"
import type {
  CustomChallengeResponse,
  CustomChallengesListResponse,
  GenerateCustomChallengePayload,
} from "@/types/challenge"

export const CUSTOM_CHALLENGES_SWR_KEY = "/api/challenges/custom"
export const GEMINI_API_KEY_STORAGE_KEY = "diffly_gemini_key"

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

export function useCustomChallenges() {
  const { data, error, isLoading, isValidating, mutate } =
    useSWR<CustomChallengesListResponse>(CUSTOM_CHALLENGES_SWR_KEY)

  const customChallenges = React.useMemo(() => data?.items ?? [], [data])
  const total = data?.total ?? customChallenges.length
  const quotaLimit = data?.quota_limit ?? 5
  const quotaRemaining =
    data?.quota_remaining ?? Math.max(0, quotaLimit - total)
  const isQuotaFull = total >= quotaLimit

  const deleteCustomChallenge = React.useCallback(
    async (identifier: string | number) => {
      const response = await apiClient.delete(
        `/api/challenges/custom/${identifier}`
      )
      await mutate()
      void globalMutate("/api/challenges")
      return response.data
    },
    [mutate]
  )

  const generateCustomChallenge = React.useCallback(
    async (
      payload: GenerateCustomChallengePayload,
      apiKey: string
    ): Promise<CustomChallengeResponse> => {
      const trimmedKey = apiKey.trim()
      const response = await apiClient.post<CustomChallengeResponse>(
        "/api/challenges/generate-custom",
        payload,
        {
          headers: {
            "X-Gemini-Key": trimmedKey,
          },
        }
      )
      await mutate()
      void globalMutate("/api/challenges")
      return response.data
    },
    [mutate]
  )

  return {
    customChallenges,
    total,
    quotaLimit,
    quotaRemaining,
    isQuotaFull,
    isLoading,
    isValidating,
    error,
    mutate,
    deleteCustomChallenge,
    generateCustomChallenge,
  }
}
