"use client"

import useSWR from "swr"
import type { ChallengeHint } from "@/types/challenge"

export function useChallengeHints(slug: string | null | undefined) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<
    ChallengeHint[]
  >(slug ? `/api/challenges/${slug}/hints` : null)

  return {
    hints: data ?? [],
    error,
    isLoading,
    isValidating,
    mutate,
  }
}
