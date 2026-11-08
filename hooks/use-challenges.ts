"use client"

import * as React from "react"
import useSWR from "swr"
import type { ChallengeFilters, ChallengeSummary } from "@/types/challenge"

export function useChallenges(filters?: ChallengeFilters) {
  const { data, error, isLoading, isValidating, mutate } =
    useSWR<ChallengeSummary[]>("/api/challenges")

  const allChallenges = React.useMemo(() => data ?? [], [data])

  const difficulty = filters?.difficulty
  const category = filters?.category
  const language = filters?.language
  const search = filters?.search

  const challenges = React.useMemo(() => {
    const trimmedSearch = search?.trim().toLowerCase()

    return allChallenges.filter((challenge) => {
      if (
        difficulty &&
        difficulty !== "All" &&
        challenge.difficulty !== difficulty
      ) {
        return false
      }

      if (category && category !== "All" && challenge.category !== category) {
        return false
      }

      if (language && language !== "All" && challenge.language !== language) {
        return false
      }

      if (trimmedSearch) {
        const titleMatch = challenge.title.toLowerCase().includes(trimmedSearch)
        const descMatch = challenge.description
          .toLowerCase()
          .includes(trimmedSearch)
        const slugMatch = challenge.slug.toLowerCase().includes(trimmedSearch)
        if (!titleMatch && !descMatch && !slugMatch) {
          return false
        }
      }

      return true
    })
  }, [allChallenges, difficulty, category, language, search])

  return {
    challenges,
    totalCount: allChallenges.length,
    error,
    isLoading,
    isValidating,
    mutate,
  }
}
