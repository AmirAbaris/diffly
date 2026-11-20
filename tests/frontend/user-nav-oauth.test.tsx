import * as React from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthCallbackToast } from "@/components/auth/auth-callback-toast"
import { AuthModal } from "@/components/auth/auth-modal"
import { UserNav } from "@/components/layout/user-nav"
import { useAuthModalStore } from "@/stores/auth-modal-store"
import { useToastStore } from "@/stores/toast-store"

const mockReplace = vi.fn()
const mockPush = vi.fn()
let mockPathname = "/challenges"
let mockSearchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}))

let mockAuthState = {
  user: null as {
    id: number
    username: string
    email: string
    avatar_url?: string | null
    github_login?: string | null
  } | null,
  isAuthenticated: false,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => mockAuthState,
}))

describe("UserNav links, GitHub OAuth visibility, and AuthCallbackToast", () => {
  beforeEach(() => {
    mockPathname = "/challenges"
    mockSearchParams = new URLSearchParams()
    mockReplace.mockReset()
    mockPush.mockReset()
    useAuthModalStore.setState({ isOpen: false, initialTab: "signin" })
    useToastStore.setState({ toasts: [] })
    mockAuthState = {
      user: {
        id: 7,
        username: "octocat",
        email: "octo@diffly.dev",
        github_login: "octocat",
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    }
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("renders Profile, Stats, and Settings as real Next links inside UserNav menu", async () => {
    const user = userEvent.setup()

    render(
      <SWRConfig
        value={{ provider: () => new Map(), fetcher: async () => null }}
      >
        <UserNav />
      </SWRConfig>
    )

    const trigger = screen.getByTestId("user-nav-trigger")
    await user.click(trigger)

    const profileLink = await screen.findByTestId("user-menu-profile")
    const statsLink = screen.getByTestId("user-menu-stats")
    const settingsLink = screen.getByTestId("user-menu-settings")

    expect(profileLink.tagName).toBe("A")
    expect(profileLink).toHaveAttribute("href", "/profile")
    expect(statsLink.tagName).toBe("A")
    expect(statsLink).toHaveAttribute("href", "/stats")
    expect(settingsLink.tagName).toBe("A")
    expect(settingsLink).toHaveAttribute("href", "/settings")
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it("shows Continue with GitHub button only when /api/auth/providers returns github: true", async () => {
    mockAuthState = {
      ...mockAuthState,
      user: null,
      isAuthenticated: false,
    }
    mockPathname = "/challenges/race-condition"

    const enabledFetcher = vi.fn(async (key: string) => {
      if (key === "/api/auth/providers") return { github: true }
      return null
    })

    const { unmount } = render(
      <SWRConfig
        value={{
          provider: () => new Map(),
          dedupingInterval: 0,
          fetcher: enabledFetcher,
        }}
      >
        <AuthModal open={true} />
      </SWRConfig>
    )

    const githubBtn = await screen.findByTestId("github-oauth-button")
    expect(githubBtn).toBeInTheDocument()
    expect(githubBtn).toHaveTextContent("Continue with GitHub")
    expect(githubBtn).toHaveAttribute(
      "href",
      "/api/auth/github/login?next=%2Fchallenges%2Frace-condition"
    )

    unmount()

    const disabledFetcher = vi.fn(async (key: string) => {
      if (key === "/api/auth/providers") return { github: false }
      return null
    })

    render(
      <SWRConfig
        value={{
          provider: () => new Map(),
          dedupingInterval: 0,
          fetcher: disabledFetcher,
        }}
      >
        <AuthModal open={true} />
      </SWRConfig>
    )

    await waitFor(() => {
      expect(disabledFetcher).toHaveBeenCalledWith("/api/auth/providers")
    })
    expect(screen.queryByTestId("github-oauth-button")).not.toBeInTheDocument()
  })

  it("maps ?auth_error=github_email_in_use to destructive toast and strips query param", async () => {
    mockPathname = "/settings"
    mockSearchParams = new URLSearchParams(
      "auth_error=github_email_in_use&tab=security"
    )

    render(
      <SWRConfig
        value={{ provider: () => new Map(), fetcher: async () => null }}
      >
        <AuthCallbackToast />
      </SWRConfig>
    )

    await waitFor(() => {
      const toasts = useToastStore.getState().toasts
      expect(toasts).toHaveLength(1)
      expect(toasts[0].variant).toBe("destructive")
      expect(toasts[0].description).toBe(
        "An account with this email exists — sign in with your password, then connect GitHub from Settings"
      )
    })

    expect(mockReplace).toHaveBeenCalledWith("/settings?tab=security", {
      scroll: false,
    })
  })

  it("handles ?auth=github_success by showing success toast, revalidating auth, and stripping param", async () => {
    mockPathname = "/profile"
    mockSearchParams = new URLSearchParams("auth=github_success")

    const fetcher = vi.fn(async () => null)

    render(
      <SWRConfig
        value={{
          provider: () => new Map(),
          dedupingInterval: 0,
          fetcher,
        }}
      >
        <AuthCallbackToast />
      </SWRConfig>
    )

    await waitFor(() => {
      const toasts = useToastStore.getState().toasts
      expect(toasts).toHaveLength(1)
      expect(toasts[0].variant).toBe("success")
    })

    expect(mockReplace).toHaveBeenCalledWith("/profile", { scroll: false })
  })
})
