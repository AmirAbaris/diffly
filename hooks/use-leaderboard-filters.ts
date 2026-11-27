"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { Category } from "@/types/challenge"
import {
  DEFAULT_LEADERBOARD_PAGE_SIZE,
  LEADERBOARD_CATEGORIES,
  LEADERBOARD_WINDOWS,
  type LeaderboardFilters,
  type LeaderboardWindow,
} from "@/types/leaderboard"

const VALID_WINDOWS = new Set<string>(LEADERBOARD_WINDOWS)
const CATEGORY_BY_LOWER = new Map<string, Category>(
  LEADERBOARD_CATEGORIES.map((category) => [category.toLowerCase(), category])
)
const MAX_LEADERBOARD_PAGE =
  Math.floor(10_000 / DEFAULT_LEADERBOARD_PAGE_SIZE) + 1

function parseWindow(raw: string | null): LeaderboardWindow {
  if (raw && VALID_WINDOWS.has(raw)) {
    return raw as LeaderboardWindow
  }
  return "all"
}

function parseCategory(raw: string | null): Category | null {
  if (!raw) return null
  return CATEGORY_BY_LOWER.get(raw.trim().toLowerCase()) ?? null
}

function parsePage(raw: string | null): number {
  if (!raw) return 1
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return Math.min(parsed, MAX_LEADERBOARD_PAGE)
}

export function useLeaderboardFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const filters: LeaderboardFilters = React.useMemo(
    () => ({
      window: parseWindow(searchParams.get("window")),
      category: parseCategory(searchParams.get("category")),
      page: parsePage(searchParams.get("page")),
      limit: DEFAULT_LEADERBOARD_PAGE_SIZE,
    }),
    [searchParams]
  )

  const updateParams = React.useCallback(
    (
      next: Partial<Pick<LeaderboardFilters, "window" | "category" | "page">>
    ) => {
      const params = new URLSearchParams(searchParams.toString())

      if ("window" in next) {
        if (!next.window || next.window === "all") {
          params.delete("window")
        } else {
          params.set("window", next.window)
        }
      }

      if ("category" in next) {
        if (!next.category) {
          params.delete("category")
        } else {
          params.set("category", next.category)
        }
      }

      if ("page" in next) {
        if (!next.page || next.page <= 1) {
          params.delete("page")
        } else {
          params.set("page", String(next.page))
        }
      }

      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      })
    },
    [pathname, router, searchParams]
  )

  const setWindow = React.useCallback(
    (window: LeaderboardWindow) => {
      updateParams({ window, page: 1 })
    },
    [updateParams]
  )

  const setCategory = React.useCallback(
    (category: Category | null) => {
      updateParams({ category, page: 1 })
    },
    [updateParams]
  )

  const setPage = React.useCallback(
    (page: number) => {
      updateParams({ page: Math.max(1, page) })
    },
    [updateParams]
  )

  const resetFilters = React.useCallback(() => {
    updateParams({ window: "all", category: null, page: 1 })
  }, [updateParams])

  return {
    filters,
    setWindow,
    setCategory,
    setPage,
    resetFilters,
  }
}
