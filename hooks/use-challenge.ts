"use client"

import useSWR from "swr"
import type { ChallengeDetail } from "@/types/challenge"

export function useChallenge(slug: string | null | undefined) {
  const { data, error, isLoading, isValidating, mutate } =
    useSWR<ChallengeDetail>(slug ? `/api/challenges/${slug}` : null, {
      keepPreviousData: false,
    })

  return {
    challenge: data,
    error,
    isLoading,
    isValidating,
    mutate,
  }
}
