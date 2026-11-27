"use client"

import * as React from "react"
import useSWR, { mutate, useSWRConfig } from "swr"
import { apiClient } from "@/lib/axios"
import {
  DEFAULT_LEADERBOARD_PAGE_SIZE,
  type LeaderboardFilters,
  type LeaderboardResponse,
} from "@/types/leaderboard"

export const LEADERBOARD_SWR_PREFIX = "/api/leaderboard"

export function isLeaderboardKey(key: unknown): key is string {
  return (
    typeof key === "string" &&
    (key === LEADERBOARD_SWR_PREFIX ||
      key.startsWith(`${LEADERBOARD_SWR_PREFIX}?`))
  )
}

export function buildLeaderboardKey(filters: LeaderboardFilters): string {
  const params = new URLSearchParams()
  const limit =
    filters.limit > 0 ? filters.limit : DEFAULT_LEADERBOARD_PAGE_SIZE
  const page = Math.max(1, filters.page)
  const offset = (page - 1) * limit

  params.set("window", filters.window)

  if (filters.category) {
    params.set("category", filters.category)
  }

  params.set("limit", String(limit))
  params.set("offset", String(offset))

  return `${LEADERBOARD_SWR_PREFIX}?${params.toString()}`
}

export function useLeaderboard(filters: LeaderboardFilters) {
  const key = buildLeaderboardKey(filters)

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate: boundMutate,
  } = useSWR<LeaderboardResponse>(key, {
    keepPreviousData: true,
  })

  const limit =
    filters.limit > 0 ? filters.limit : DEFAULT_LEADERBOARD_PAGE_SIZE
  const totalEntries = data?.total_entries ?? 0
  const totalPages = Math.max(1, Math.ceil(totalEntries / limit))

  return {
    data: data ?? null,
    entries: data?.entries ?? [],
    currentUser: data?.current_user ?? null,
    totalEntries,
    totalCatalogChallenges: data?.total_catalog_challenges ?? 0,
    totalPages,
    error,
    isLoading,
    isValidating,
    mutate: boundMutate,
  }
}

export async function mutateLeaderboard() {
  return mutate(isLeaderboardKey)
}

export function useLeaderboardVisibility() {
  const { mutate: scopedMutate } = useSWRConfig()
  const [isUpdating, setIsUpdating] = React.useState(false)

  const setVisibility = React.useCallback(
    async (visible: boolean) => {
      setIsUpdating(true)
      try {
        const response = await apiClient.put<{ visible: boolean }>(
          "/api/leaderboard/me/visibility",
          { visible }
        )
        void scopedMutate(isLeaderboardKey).catch(() => undefined)
        return response.data
      } finally {
        setIsUpdating(false)
      }
    },
    [scopedMutate]
  )

  return {
    setVisibility,
    isUpdating,
  }
}
