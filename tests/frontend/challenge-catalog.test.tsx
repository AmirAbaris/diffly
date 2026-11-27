import * as React from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ChallengeCatalog } from "@/components/challenges/challenge-catalog"
import { apiClient } from "@/lib/axios"
import type { ChallengeSummary } from "@/types/challenge"

const mockReplace = vi.fn()
let currentSearchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: (url: string, opts?: unknown) => {
      mockReplace(url, opts)
      const queryIdx = url.indexOf("?")
      currentSearchParams = new URLSearchParams(
        queryIdx >= 0 ? url.slice(queryIdx + 1) : ""
      )
    },
  }),
  usePathname: () => "/challenges",
  useSearchParams: () => currentSearchParams,
}))

function makeSummary(
  id: number,
  overrides?: Partial<ChallengeSummary>
): ChallengeSummary {
  return {
    id,
    slug: `challenge-${id}`,
    title: `Challenge Title ${id}`,
    difficulty: "Medium",
    category: "Security",
    language: "python",
    description: `Description ${id}`,
    estimated_minutes: 5,
    line_count: 15,
    total_hints: 3,
    is_solved: false,
    best_score: null,
    ...overrides,
  }
}

describe("ChallengeCatalog server filtering and pagination", () => {
  beforeEach(() => {
    currentSearchParams = new URLSearchParams()
    mockReplace.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("queries paginated server endpoint and navigates pages", async () => {
    const page1Items = Array.from({ length: 12 }, (_, idx) =>
      makeSummary(idx + 1)
    )
    const page2Items = [makeSummary(13), makeSummary(14)]

    const getSpy = vi
      .spyOn(apiClient, "get")
      .mockImplementation((url: string) => {
        if (url.includes("offset=12")) {
          return Promise.resolve({
            data: page2Items,
            headers: { "x-total-count": "14" },
          })
        }
        return Promise.resolve({
          data: page1Items,
          headers: { "x-total-count": "14" },
        })
      })

    const user = userEvent.setup()

    const { rerender } = render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <ChallengeCatalog />
      </SWRConfig>
    )

    expect(await screen.findByText("Challenge Title 1")).toBeInTheDocument()
    expect(getSpy).toHaveBeenCalledWith("/api/challenges?limit=12&offset=0")
    expect(screen.getByTestId("catalog-pagination")).toBeInTheDocument()
    expect(screen.getByTestId("pagination-page-2")).toBeInTheDocument()

    await user.click(screen.getByTestId("pagination-page-2"))
    expect(mockReplace).toHaveBeenCalledWith("/challenges?page=2", {
      scroll: false,
    })

    rerender(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <ChallengeCatalog />
      </SWRConfig>
    )

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith("/api/challenges?limit=12&offset=12")
    })
    expect(await screen.findByText("Challenge Title 13")).toBeInTheDocument()
  })

  it("passes difficulty filter to server and resets page to 1", async () => {
    currentSearchParams = new URLSearchParams("page=2")
    const getSpy = vi
      .spyOn(apiClient, "get")
      .mockImplementation((url: string) => {
        if (url.includes("difficulty=Hard")) {
          return Promise.resolve({
            data: [makeSummary(99, { difficulty: "Hard", title: "Hard Flaw" })],
            headers: { "x-total-count": "1" },
          })
        }
        return Promise.resolve({
          data: [makeSummary(13)],
          headers: { "x-total-count": "14" },
        })
      })

    const user = userEvent.setup()
    const cache = new Map()
    const { rerender } = render(
      <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
        <ChallengeCatalog />
      </SWRConfig>
    )

    expect(await screen.findByText("Challenge Title 13")).toBeInTheDocument()

    await user.click(screen.getByRole("radio", { name: "Hard" }))
    expect(mockReplace).toHaveBeenCalledWith("/challenges?difficulty=Hard", {
      scroll: false,
    })

    rerender(
      <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
        <ChallengeCatalog />
      </SWRConfig>
    )

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith(
        "/api/challenges?difficulty=Hard&limit=12&offset=0"
      )
    })
    expect(await screen.findByText("Hard Flaw")).toBeInTheDocument()
    expect(screen.queryByTestId("catalog-pagination")).not.toBeInTheDocument()
  })

  it("clamps out-of-bounds page params and renders error state when request fails", async () => {
    currentSearchParams = new URLSearchParams("page=99")
    const getSpy = vi
      .spyOn(apiClient, "get")
      .mockImplementation((url: string) => {
        if (url.includes("offset=12")) {
          return Promise.resolve({
            data: [makeSummary(13), makeSummary(14)],
            headers: { "x-total-count": "14" },
          })
        }
        return Promise.resolve({
          data: [],
          headers: { "x-total-count": "14" },
        })
      })

    const { rerender } = render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <ChallengeCatalog />
      </SWRConfig>
    )

    expect(await screen.findByText("Challenge Title 13")).toBeInTheDocument()
    expect(getSpy).toHaveBeenCalledWith("/api/challenges?limit=12&offset=12")
    expect(screen.getByTestId("catalog-pagination")).toHaveTextContent(
      "Page 2 of 2"
    )

    getSpy.mockRejectedValueOnce(new Error("Network fail"))
    currentSearchParams = new URLSearchParams("difficulty=Easy")
    rerender(
      <SWRConfig
        value={{
          provider: () => new Map(),
          dedupingInterval: 0,
          shouldRetryOnError: false,
        }}
      >
        <ChallengeCatalog />
      </SWRConfig>
    )

    expect(await screen.findByTestId("catalog-error-state")).toBeInTheDocument()
  })

  it("accepts language=csharp from URL search params and queries the server", async () => {
    currentSearchParams = new URLSearchParams("language=csharp")
    const getSpy = vi.spyOn(apiClient, "get").mockResolvedValue({
      data: [
        makeSummary(32, {
          slug: "csharp-httpclient-socket-exhaustion",
          title: "Per-Request HttpClient Instantiation",
          language: "csharp",
        }),
      ],
      headers: { "x-total-count": "1" },
    })

    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <ChallengeCatalog />
      </SWRConfig>
    )

    expect(
      await screen.findByText("Per-Request HttpClient Instantiation")
    ).toBeInTheDocument()
    expect(getSpy).toHaveBeenCalledWith(
      "/api/challenges?language=csharp&limit=12&offset=0"
    )
  })
})
