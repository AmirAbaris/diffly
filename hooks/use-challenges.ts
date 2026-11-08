"use client"

import useSWR from "swr"
import type { ChallengeFilters, ChallengeSummary } from "@/types/challenge"

export function useChallenges(filters?: ChallengeFilters) {
  const params = new URLSearchParams()

  if (filters?.difficulty && filters.difficulty !== "All") {
    params.set("difficulty", filters.difficulty)
  }

  if (filters?.category && filters.category !== "All") {
    params.set("category", filters.category)
  }

  if (filters?.language && filters.language !== "All") {
    params.set("language", filters.language)
  }

  const trimmedSearch = filters?.search?.trim()
  if (trimmedSearch) {
    params.set("search", trimmedSearch)
  }

  const query = params.toString()
  const endpoint = query ? `/api/challenges?${query}` : "/api/challenges"

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<ChallengeSummary[]>(endpoint)

  return {
    challenges: data ?? [],
    error,
    isLoading,
    isValidating,
    mutate,
  }
}
