"use client"

import useSWR, { mutate } from "swr"
import type { UserProgress } from "@/types/challenge"

export const USER_PROGRESS_SWR_KEY = "/api/user/progress"

export function useUserStats() {
  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate: boundMutate,
  } = useSWR<UserProgress>(USER_PROGRESS_SWR_KEY)

  const stats = data ?? null

  return {
    stats,
    error,
    isLoading,
    isValidating,
    mutate: boundMutate,
    totalSolved: stats?.total_solved ?? 0,
    totalChallenges: stats?.total_challenges ?? 0,
    totalAttempted: stats?.total_attempted ?? 0,
    averageScore: stats?.average_score ?? 0,
    streakDays: stats?.streak_days ?? 0,
    categories: stats?.categories_breakdown ?? [],
  }
}

/**
 * Triggers an immediate revalidation of the user progress/stats cache across the app.
 */
export async function mutateUserStats() {
  return mutate(USER_PROGRESS_SWR_KEY)
}
