"use client"

import useSWR, { mutate } from "swr"
import { mutateLeaderboard } from "@/hooks/use-leaderboard"
import { useTimezonePreference } from "@/hooks/use-timezone-preference"
import type { UserProgressExtended } from "@/types/analytics"

export const USER_PROGRESS_SWR_KEY = "/api/user/progress"

export function buildUserProgressKey(timezone: string): string {
  return `${USER_PROGRESS_SWR_KEY}?tz=${encodeURIComponent(timezone)}`
}

export function useUserStats() {
  const { timezone } = useTimezonePreference()
  const key = buildUserProgressKey(timezone)

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate: boundMutate,
  } = useSWR<UserProgressExtended>(key)

  const stats = data ?? null

  return {
    stats,
    error,
    isLoading,
    isValidating,
    mutate: boundMutate,
    timezone: stats?.timezone ?? timezone,
    totalSolved: stats?.total_solved ?? 0,
    totalChallenges: stats?.total_challenges ?? 0,
    totalAttempted: stats?.total_attempted ?? 0,
    averageScore: stats?.average_score ?? 0,
    streakDays: stats?.streak_days ?? 0,
    customAttempted: stats?.custom_attempted ?? 0,
    customSolved: stats?.custom_solved ?? 0,
    categories: stats?.categories_breakdown ?? [],
  }
}

/**
 * Triggers an immediate revalidation of user progress, analytics, and next-drill caches across the app.
 */
export async function mutateUserStats() {
  return Promise.all([
    mutate(
      (key) => typeof key === "string" && key.startsWith(USER_PROGRESS_SWR_KEY)
    ),
    mutate(
      (key) => typeof key === "string" && key.startsWith("/api/user/analytics")
    ),
    mutate(
      (key) => typeof key === "string" && key.startsWith("/api/challenges/next")
    ),
    mutateLeaderboard(),
  ])
}
