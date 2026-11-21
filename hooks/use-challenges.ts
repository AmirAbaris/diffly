"use client"

import * as React from "react"
import useSWR from "swr"
import { apiClient } from "@/lib/axios"
import type { ChallengeFilters, ChallengeSummary } from "@/types/challenge"

export const DEFAULT_CATALOG_PAGE_SIZE = 12

interface ChallengesPageResult {
  items: ChallengeSummary[]
  totalCount: number
}

export function buildChallengesQueryUrl(filters?: ChallengeFilters): string {
  if (!filters) {
    return "/api/challenges"
  }

  const params = new URLSearchParams()

  if (filters.difficulty && filters.difficulty !== "All") {
    params.set("difficulty", filters.difficulty)
  }

  if (filters.category && filters.category !== "All") {
    params.set("category", filters.category)
  }

  if (filters.language && filters.language !== "All") {
    params.set("language", filters.language)
  }

  const trimmedSearch = filters.search?.trim()
  if (trimmedSearch) {
    params.set("search", trimmedSearch)
  }

  const pageSize =
    filters.limit !== undefined && filters.limit > 0
      ? filters.limit
      : DEFAULT_CATALOG_PAGE_SIZE
  const page = Math.max(1, filters.page ?? 1)
  const offset = (page - 1) * pageSize

  params.set("limit", String(pageSize))
  params.set("offset", String(offset))

  const queryString = params.toString()
  return queryString ? `/api/challenges?${queryString}` : "/api/challenges"
}

async function fetchChallengesPage(url: string): Promise<ChallengesPageResult> {
  const response = await apiClient.get<ChallengeSummary[]>(url)
  const items = Array.isArray(response.data) ? response.data : []
  const rawTotal = response.headers?.["x-total-count"]
  const parsedTotal =
    rawTotal !== undefined ? Number.parseInt(String(rawTotal), 10) : Number.NaN

  return {
    items,
    totalCount: Number.isFinite(parsedTotal) ? parsedTotal : items.length,
  }
}

export function useChallenges(filters?: ChallengeFilters) {
  const hasFilters = filters !== undefined
  const pageSize =
    filters?.limit !== undefined && filters.limit > 0
      ? filters.limit
      : DEFAULT_CATALOG_PAGE_SIZE
  const page = Math.max(1, filters?.page ?? 1)

  const difficulty = filters?.difficulty
  const category = filters?.category
  const language = filters?.language
  const search = filters?.search

  const queryUrl = React.useMemo(
    () =>
      hasFilters
        ? buildChallengesQueryUrl({
            difficulty,
            category,
            language,
            search,
            page,
            limit: pageSize,
          })
        : "/api/challenges",
    [hasFilters, difficulty, category, language, search, page, pageSize]
  )

  const listQuery = useSWR<ChallengeSummary[]>(hasFilters ? null : queryUrl)

  const pageQuery = useSWR<ChallengesPageResult>(
    hasFilters ? queryUrl : null,
    fetchChallengesPage,
    { keepPreviousData: true }
  )

  const challenges = React.useMemo(() => {
    if (hasFilters) {
      return pageQuery.data?.items ?? []
    }
    return listQuery.data ?? []
  }, [hasFilters, pageQuery.data?.items, listQuery.data])

  const totalCount = hasFilters
    ? (pageQuery.data?.totalCount ?? challenges.length)
    : challenges.length

  const totalPages = hasFilters
    ? Math.max(1, Math.ceil(totalCount / pageSize))
    : 1

  const mutatePage = pageQuery.mutate
  const mutateList = listQuery.mutate
  const mutate = React.useCallback(async () => {
    if (hasFilters) {
      await mutatePage()
      return
    }
    await mutateList()
  }, [hasFilters, mutatePage, mutateList])

  return {
    challenges,
    totalCount,
    page,
    pageSize,
    totalPages,
    error: hasFilters ? pageQuery.error : listQuery.error,
    isLoading: hasFilters ? pageQuery.isLoading : listQuery.isLoading,
    isValidating: hasFilters ? pageQuery.isValidating : listQuery.isValidating,
    mutate,
  }
}
