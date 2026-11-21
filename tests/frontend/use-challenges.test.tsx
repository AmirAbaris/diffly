import { renderHook, waitFor } from "@testing-library/react"
import * as React from "react"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  buildChallengesQueryUrl,
  DEFAULT_CATALOG_PAGE_SIZE,
  useChallenges,
} from "@/hooks/use-challenges"
import { apiClient } from "@/lib/axios"
import type { ChallengeSummary } from "@/types/challenge"

function makeSummary(id: number, slug: string): ChallengeSummary {
  return {
    id,
    slug,
    title: `Challenge ${slug}`,
    difficulty: "Medium",
    category: "Security",
    language: "python",
    description: `Description for ${slug}`,
    estimated_minutes: 5,
    line_count: 10,
    total_hints: 3,
    is_solved: false,
    best_score: null,
  }
}

describe("useChallenges server-side filtering and pagination", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("builds server query URL omitting 'All' and whitespace-only search", () => {
    expect(buildChallengesQueryUrl()).toBe("/api/challenges")
    expect(
      buildChallengesQueryUrl({
        difficulty: "All",
        category: "All",
        language: "All",
        search: "   ",
      })
    ).toBe(`/api/challenges?limit=${DEFAULT_CATALOG_PAGE_SIZE}&offset=0`)

    expect(
      buildChallengesQueryUrl({
        difficulty: "Hard",
        category: "Security",
        language: "typescript",
        search: "  jwt bypass ",
        page: 3,
        limit: 12,
      })
    ).toBe(
      "/api/challenges?difficulty=Hard&category=Security&language=typescript&search=jwt+bypass&limit=12&offset=24"
    )
  })

  it("fetches filtered page with X-Total-Count header and computes pagination metadata", async () => {
    const items = [makeSummary(1, "ch-1"), makeSummary(2, "ch-2")]
    const getSpy = vi.spyOn(apiClient, "get").mockResolvedValueOnce({
      data: items,
      headers: { "x-total-count": "26" },
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        {children}
      </SWRConfig>
    )

    const { result } = renderHook(
      () =>
        useChallenges({
          difficulty: "Medium",
          category: "Security",
          language: "python",
          search: "sqli",
          page: 2,
          limit: 12,
        }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.challenges).toHaveLength(2)
    })

    expect(getSpy).toHaveBeenCalledWith(
      "/api/challenges?difficulty=Medium&category=Security&language=python&search=sqli&limit=12&offset=12"
    )
    expect(result.current.totalCount).toBe(26)
    expect(result.current.page).toBe(2)
    expect(result.current.pageSize).toBe(12)
    expect(result.current.totalPages).toBe(3)
  })

  it("preserves unfiltered /api/challenges behavior when called without arguments", async () => {
    const items = [makeSummary(1, "pub-1")]
    const fetcher = vi.fn().mockResolvedValueOnce(items)

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SWRConfig
        value={{
          provider: () => new Map(),
          dedupingInterval: 0,
          fetcher,
        }}
      >
        {children}
      </SWRConfig>
    )

    const { result } = renderHook(() => useChallenges(), { wrapper })

    await waitFor(() => {
      expect(result.current.challenges).toEqual(items)
    })

    expect(fetcher).toHaveBeenCalledWith("/api/challenges")
    expect(result.current.totalCount).toBe(1)
    expect(result.current.totalPages).toBe(1)
  })
})
