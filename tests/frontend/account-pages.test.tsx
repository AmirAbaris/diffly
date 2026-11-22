import * as React from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ProfileView } from "@/components/account/profile-view"
import { SettingsView } from "@/components/account/settings-view"
import { StatsView } from "@/components/account/stats-view"
import { LEGACY_GEMINI_STORAGE_KEY } from "@/hooks/use-ai-connection"
import { apiClient } from "@/lib/axios"
import { useAuthModalStore } from "@/stores/auth-modal-store"
import type { UserAnalytics } from "@/types/analytics"

let mockPathname = "/stats"

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

let mockAuthState = {
  user: null as {
    id: number
    username: string
    email: string
    avatar_url?: string | null
    github_login?: string | null
    has_password?: boolean
    created_at?: string
  } | null,
  isAuthenticated: false,
  isLoading: false,
  logout: vi.fn(),
}

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => mockAuthState,
}))

const SAMPLE_ANALYTICS: UserAnalytics = {
  timezone: "America/New_York",
  days: 90,
  streak_days: 4,
  longest_streak_days: 9,
  total_submissions: 14,
  activity: [
    { date: "2026-11-16", count: 0 },
    { date: "2026-11-17", count: 2 },
    { date: "2026-11-18", count: 5 },
  ],
  category_mastery: [
    {
      category: "Security",
      total: 6,
      attempted: 4,
      solved: 3,
      mastery: 78.4,
      precision: 86.2,
      recall: 74.5,
    },
    {
      category: "Concurrency",
      total: 4,
      attempted: 2,
      solved: 1,
      mastery: 45.0,
      precision: 60.0,
      recall: 50.0,
    },
  ],
  trends: [
    {
      date: "2026-11-17",
      submissions: 2,
      precision: 80,
      recall: 70,
      average_score: 75,
    },
    {
      date: "2026-11-18",
      submissions: 3,
      precision: 92,
      recall: 85,
      average_score: 88,
    },
  ],
  custom: {
    attempted: 3,
    solved: 2,
    submissions: 5,
  },
}

describe("Account pages (/stats, /profile, /settings)", () => {
  beforeEach(() => {
    window.localStorage.clear()
    useAuthModalStore.setState({ isOpen: false, initialTab: "signin" })
    mockPathname = "/stats"
    mockAuthState = {
      user: null,
      isAuthenticated: false,
      isLoading: false,
      logout: vi.fn().mockResolvedValue(undefined),
    }
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("renders StatsView with mocked analytics for guests and updates window on 30/90/365 toggle", async () => {
    const user = userEvent.setup()
    const requestedUrls: string[] = []

    const fetcher = vi.fn(async (key: string) => {
      requestedUrls.push(key)
      if (key.startsWith("/api/user/analytics")) {
        const params = new URLSearchParams(key.split("?")[1] ?? "")
        const days = Number(params.get("days") ?? 90)
        return { ...SAMPLE_ANALYTICS, days }
      }
      if (key.startsWith("/api/user/progress")) {
        return {
          total_challenges: 15,
          total_attempted: 6,
          total_solved: 4,
          average_score: 81.2,
          streak_days: 4,
          timezone: "America/New_York",
          custom_attempted: 3,
          custom_solved: 2,
          categories_breakdown: [],
        }
      }
      return null
    })

    render(
      <SWRConfig
        value={{
          provider: () => new Map(),
          dedupingInterval: 0,
          fetcher,
        }}
      >
        <StatsView />
      </SWRConfig>
    )

    expect(await screen.findByTestId("stats-view")).toBeInTheDocument()
    expect(screen.getByTestId("stats-guest-banner")).toBeInTheDocument()
    expect(screen.getByTestId("stats-active-timezone")).toHaveTextContent(
      "America/New_York"
    )
    expect(screen.getByTestId("activity-heatmap-grid")).toBeInTheDocument()
    expect(screen.getByTestId("precision-recall-svg")).toBeInTheDocument()
    expect(
      screen.getByTestId("category-mastery-row-Security")
    ).toHaveTextContent("Precision: 86%")
    expect(
      screen.getByTestId("category-mastery-row-Security")
    ).toHaveTextContent("Recall: 75%")
    expect(screen.getByTestId("custom-challenge-stats-card")).toHaveTextContent(
      "5"
    )

    await user.click(screen.getByTestId("stats-window-30"))

    await waitFor(() => {
      expect(requestedUrls.some((url) => url.includes("days=30"))).toBe(true)
    })
  })

  it("shows empty sign-in state on /profile for unauthenticated users and profile details when signed in", async () => {
    const user = userEvent.setup()
    mockPathname = "/profile"

    const fetcher = vi.fn(async (key: string) => {
      if (key.startsWith("/api/user/analytics")) return SAMPLE_ANALYTICS
      if (key.startsWith("/api/user/progress")) {
        return {
          total_challenges: 15,
          total_attempted: 6,
          total_solved: 4,
          average_score: 84,
          streak_days: 4,
          timezone: "America/New_York",
          categories_breakdown: [],
        }
      }
      return null
    })

    const { rerender } = render(
      <SWRConfig value={{ provider: () => new Map(), fetcher }}>
        <ProfileView />
      </SWRConfig>
    )

    expect(screen.getByTestId("account-auth-empty")).toBeInTheDocument()
    await user.click(screen.getByTestId("account-auth-signin-button"))
    expect(useAuthModalStore.getState().isOpen).toBe(true)

    mockAuthState = {
      ...mockAuthState,
      user: {
        id: 12,
        username: "ada",
        email: "ada@diffly.dev",
        github_login: "adalovelace",
        created_at: "2026-01-15T10:00:00Z",
      },
      isAuthenticated: true,
    }

    rerender(
      <SWRConfig value={{ provider: () => new Map(), fetcher }}>
        <ProfileView />
      </SWRConfig>
    )

    expect(await screen.findByTestId("profile-view")).toBeInTheDocument()
    expect(screen.getByText("@ada")).toBeInTheDocument()
    expect(screen.getByText("ada@diffly.dev")).toBeInTheDocument()
    expect(screen.getByTestId("profile-github-status")).toHaveTextContent(
      "@adalovelace"
    )
  })

  it("renders multi-provider AI & Agent Connections card on /settings, supports Test & Save and Disconnect, and scrubs legacy key", async () => {
    const user = userEvent.setup()
    mockPathname = "/settings"
    window.localStorage.setItem(LEGACY_GEMINI_STORAGE_KEY, "AIzaSyTest123456")

    mockAuthState = {
      ...mockAuthState,
      user: {
        id: 12,
        username: "ada",
        email: "ada@diffly.dev",
        github_login: null,
        has_password: true,
      },
      isAuthenticated: true,
    }

    const fetcher = vi.fn(async (key: string) => {
      if (key === "/api/auth/providers") return { github: true }
      if (key === "/api/ai/connection") return { connected: false }
      return null
    })

    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValueOnce({
      data: {
        connected: true,
        provider: "google",
        model: "gemini-2.5-pro",
        maskedKey: "AIza••••3456",
      },
    })
    const deleteSpy = vi.spyOn(apiClient, "delete").mockResolvedValueOnce({
      data: { connected: false },
    })

    render(
      <SWRConfig
        value={{
          provider: () => new Map(),
          dedupingInterval: 0,
          fetcher,
        }}
      >
        <SettingsView />
      </SWRConfig>
    )

    const connectLink = await screen.findByTestId("connect-github-button")
    expect(connectLink).toHaveAttribute(
      "href",
      "/api/auth/github/login?next=/settings"
    )

    expect(window.localStorage.getItem(LEGACY_GEMINI_STORAGE_KEY)).toBeNull()
    expect(screen.getByTestId("ai-connection-status-badge")).toHaveTextContent(
      "Not connected"
    )
    expect(screen.getByTestId("ai-privacy-notice")).toHaveTextContent(
      /HttpOnly.*Path=\/api.*never stored in our database/i
    )

    await user.click(screen.getByTestId("ai-suggested-model-gemini-2.5-pro"))
    expect(screen.getByTestId("ai-model-input")).toHaveValue("gemini-2.5-pro")

    await user.type(screen.getByTestId("ai-api-key-input"), "AIzaSyLiveKey3456")
    await user.click(screen.getByTestId("ai-test-save-button"))

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        "/api/ai/connection",
        {
          provider: "google",
          model: "gemini-2.5-pro",
          apiKey: "AIzaSyLiveKey3456",
          baseUrl: undefined,
        },
        expect.objectContaining({ timeout: 20_000 })
      )
      expect(
        screen.getByTestId("ai-connection-status-badge")
      ).toHaveTextContent(
        "Connected: Google Gemini (gemini-2.5-pro) · AIza••••3456"
      )
    })

    await user.click(screen.getByTestId("ai-disconnect-button"))

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith("/api/ai/connection")
      expect(
        screen.getByTestId("ai-connection-status-badge")
      ).toHaveTextContent("Not connected")
    })

    postSpy.mockRestore()
    deleteSpy.mockRestore()
  })

  it("renders AI & Agent Connections and Timezone cards for unauthenticated guests on /settings while gating Account & Session cards", async () => {
    mockPathname = "/settings"
    mockAuthState = {
      user: null,
      isAuthenticated: false,
      isLoading: false,
      logout: vi.fn(),
    }

    const fetcher = vi.fn(async (key: string) => {
      if (key === "/api/ai/connection") {
        return {
          connected: true,
          provider: "openai",
          model: "gpt-4.1-mini",
          maskedKey: "sk-p••••9999",
        }
      }
      return null
    })

    render(
      <SWRConfig
        value={{
          provider: () => new Map(),
          dedupingInterval: 0,
          fetcher,
        }}
      >
        <SettingsView />
      </SWRConfig>
    )

    expect(
      await screen.findByTestId("settings-ai-connection-card")
    ).toBeInTheDocument()
    expect(
      await screen.findByTestId("ai-connection-status-badge")
    ).toHaveTextContent("Connected: OpenAI (gpt-4.1-mini) · sk-p••••9999")
    expect(screen.getByTestId("timezone-select-trigger")).toBeInTheDocument()
    expect(screen.getByTestId("account-auth-empty")).toBeInTheDocument()
    expect(
      screen.queryByTestId("settings-signout-button")
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("connect-github-button")
    ).not.toBeInTheDocument()
  })
})
