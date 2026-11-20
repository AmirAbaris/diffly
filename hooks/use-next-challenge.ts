"use client"

import * as React from "react"
import useSWR from "swr"
import { apiClient } from "@/lib/axios"
import type {
  NextChallengeReason,
  NextChallengeResponse,
} from "@/types/analytics"

export const NEXT_CHALLENGE_SWR_KEY = "/api/challenges/next"

export function buildNextChallengeUrl(
  excludeSlug?: string,
  category?: string
): string {
  const params = new URLSearchParams()
  if (excludeSlug) {
    params.set("exclude", excludeSlug)
  }
  if (category) {
    params.set("category", category)
  }
  const queryString = params.toString()
  return queryString
    ? `${NEXT_CHALLENGE_SWR_KEY}?${queryString}`
    : NEXT_CHALLENGE_SWR_KEY
}

const REASON_LABELS: Record<NextChallengeReason, string> = {
  due_review: "Due for spaced-repetition review",
  weak_category: "Targets a weak category",
  new_material: "Unattempted challenge",
  refresh: "Practice refresh",
}

export function formatNextChallengeReason(
  reason: NextChallengeReason | string
): string {
  return REASON_LABELS[reason as NextChallengeReason] ?? "Recommended drill"
}

export function useNextChallenge(excludeSlug?: string, category?: string) {
  const key = buildNextChallengeUrl(excludeSlug, category)

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<NextChallengeResponse | null>(key, {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    })

  const fetchNextChallenge =
    React.useCallback(async (): Promise<NextChallengeResponse | null> => {
      try {
        const response = await apiClient.get<NextChallengeResponse>(key)
        await mutate(response.data, false)
        return response.data
      } catch {
        return null
      }
    }, [key, mutate])

  return {
    nextChallenge: data ?? null,
    error,
    isLoading,
    isValidating,
    mutate,
    fetchNextChallenge,
  }
}
