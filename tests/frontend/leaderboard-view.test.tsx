import * as React from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LeaderboardView } from "@/components/leaderboard/leaderboard-view"
import { apiClient } from "@/lib/axios"
import { useAuthModalStore } from "@/stores/auth-modal-store"
import type { LeaderboardResponse } from "@/types/leaderboard"

const mockReplace = vi.fn()
let mockSearchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  usePathname: () => "/leaderboard",
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}))

let mockAuthState = {
  user: null as { id: number; username: string; email: string } | null,
  isAuthenticated: false,
  isLoading: false,
  logout: vi.fn(),
}

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => mockAuthState,
}))

const SAMPLE_RESPONSE: LeaderboardResponse = {
  window: "all",
  category: null,
  limit: 25,
  offset: 0,
  total_entries: 3,
  total_catalog_challenges: 20,
  entries: [
    {
      rank: 1,
      username: "ada",
      points: 1850,
      challenges_solved: 14,
      hard_solved: 5,
      average_score: 94.2,
      is_current_user: false,
    },
    {
      rank: 2,
      username: "linus",
      points: 1420,
      challenges_solved: 11,
      hard_solved: 3,
      average_score: 89.5,
      is_current_user: true,
    },
    {
      rank: 3,
      username: "grace",
      points: 1100,
      challenges_solved: 9,
      hard_solved: 2,
      average_score: 86.0,
      is_current_user: false,
    },
  ],
  current_user: {
    rank: 2,
    username: "linus",
    points: 1420,
    challenges_solved: 11,
    hard_solved: 3,
    average_score: 89.5,
    percentile: 33.3,
    hidden: false,
  },
}

function renderWithSWR(fetcher: (key: string) => Promise<unknown>) {
  return render(
    <SWRConfig
      value={{ provider: () => new Map(), fetcher, dedupingInterval: 0 }}
    >
      <LeaderboardView />
    </SWRConfig>
  )
}

describe("LeaderboardView", () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams()
    mockReplace.mockReset()
    useAuthModalStore.setState({ isOpen: false, initialTab: "signin" })
    mockAuthState = {
      user: null,
      isAuthenticated: false,
      isLoading: false,
      logout: vi.fn(),
    }
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("renders rankings, highlights current user, and toggles visibility via PUT", async () => {
    const user = userEvent.setup()
    mockAuthState = {
      user: { id: 2, username: "linus", email: "linus@example.com" },
      isAuthenticated: true,
      isLoading: false,
      logout: vi.fn(),
    }

    const putSpy = vi
      .spyOn(apiClient, "put")
      .mockResolvedValue({ data: { visible: false } })
    const fetcher = vi.fn(async () => SAMPLE_RESPONSE)

    renderWithSWR(fetcher)

    await waitFor(() => {
      expect(screen.getByTestId("leaderboard-list")).toBeTruthy()
    })

    const rows = screen.getAllByTestId("leaderboard-row")
    expect(rows).toHaveLength(3)
    expect(rows[1].getAttribute("data-current-user")).toBe("true")
    expect(screen.getByTestId("leaderboard-you-badge")).toBeTruthy()
    expect(screen.getByTestId("current-user-rank-value").textContent).toBe("#2")

    await user.click(screen.getByTestId("leaderboard-visibility-toggle"))

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith("/api/leaderboard/me/visibility", {
        visible: false,
      })
    })
  })

  it("shows signed-out banner and opens auth modal on Sign In click", async () => {
    const user = userEvent.setup()
    const fetcher = vi.fn(async () => ({
      ...SAMPLE_RESPONSE,
      current_user: null,
    }))

    renderWithSWR(fetcher)

    await waitFor(() => {
      expect(screen.getByTestId("leaderboard-signed-out-banner")).toBeTruthy()
    })

    await user.click(screen.getByTestId("leaderboard-signin-button"))
    expect(useAuthModalStore.getState().isOpen).toBe(true)
    expect(useAuthModalStore.getState().initialTab).toBe("signin")
  })

  it("renders empty state when no entries match", async () => {
    const fetcher = vi.fn(async () => ({
      ...SAMPLE_RESPONSE,
      entries: [],
      total_entries: 0,
      current_user: null,
    }))

    renderWithSWR(fetcher)

    await waitFor(() => {
      expect(screen.getByTestId("leaderboard-empty")).toBeTruthy()
    })
    expect(screen.getByText("No ranked reviewers yet")).toBeTruthy()
  })

  it("updates URL query params when timeframe toggle is clicked", async () => {
    const user = userEvent.setup()
    const fetcher = vi.fn(async () => ({
      ...SAMPLE_RESPONSE,
      current_user: null,
    }))

    renderWithSWR(fetcher)

    await waitFor(() => {
      expect(screen.getByTestId("leaderboard-window-30d")).toBeTruthy()
    })

    await user.click(screen.getByTestId("leaderboard-window-30d"))

    expect(mockReplace).toHaveBeenCalledWith("/leaderboard?window=30d", {
      scroll: false,
    })
  })

  it("renders hidden state and allows opting back in", async () => {
    const user = userEvent.setup()
    mockAuthState = {
      user: { id: 2, username: "linus", email: "linus@example.com" },
      isAuthenticated: true,
      isLoading: false,
      logout: vi.fn(),
    }

    const putSpy = vi
      .spyOn(apiClient, "put")
      .mockResolvedValue({ data: { visible: true } })
    const fetcher = vi.fn(async () => ({
      ...SAMPLE_RESPONSE,
      current_user: {
        ...SAMPLE_RESPONSE.current_user!,
        rank: null,
        percentile: null,
        hidden: true,
      },
    }))

    renderWithSWR(fetcher)

    await waitFor(() => {
      expect(screen.getByTestId("leaderboard-hidden-badge")).toBeTruthy()
    })

    await user.click(screen.getByTestId("leaderboard-visibility-toggle"))

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith("/api/leaderboard/me/visibility", {
        visible: true,
      })
    })
  })
})
