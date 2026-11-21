import * as React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ArenaLayout } from "@/components/review/arena-layout"
import { ComparisonView } from "@/components/review/comparison-view"
import { FLAGGING_GUIDE_STORAGE_KEY } from "@/components/review/flagging-guide-modal"
import { ShareTokenProvider } from "@/components/review/share-token-context"
import { SubmissionHistoryDrawer } from "@/components/review/submission-history-drawer"
import { useAuth } from "@/lib/auth"
import { apiClient } from "@/lib/axios"
import { useArenaUIStore } from "@/stores/arena-ui-store"
import { useReviewDraftStore } from "@/stores/review-draft-store"
import type { ChallengeDetail } from "@/types/challenge"

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => "/challenges/custom-slug",
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/components/layout/nav-stats", () => ({
  NavStats: () => <div data-testid="nav-stats-stub" />,
}))

vi.mock("@/components/layout/user-nav", () => ({
  UserNav: () => <div data-testid="user-nav-stub" />,
}))

function makeChallenge(
  overrides: Partial<ChallengeDetail> & { slug: string }
): ChallengeDetail {
  return {
    id: 1,
    title: `Challenge ${overrides.slug}`,
    difficulty: "Medium",
    category: "Security",
    language: "python",
    description: `Overview for ${overrides.slug}`,
    estimated_minutes: 10,
    line_count: 3,
    total_hints: 3,
    is_solved: false,
    best_score: null,
    threat_model: "Untrusted input reaches sink.",
    defect_target: "Spot the injection risk.",
    code_snippet: "def check(x):\n    return x\n",
    ...overrides,
  }
}

describe("ArenaLayout shared custom challenge session", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem(FLAGGING_GUIDE_STORAGE_KEY, "true")
    useArenaUIStore.getState().resetArenaUI()
    useReviewDraftStore.setState({ drafts: {} })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("propagates share_token to detail, hints, submissions, and renders shared notice", async () => {
    const requestedKeys: string[] = []
    const fetcher = vi.fn((key: string) => {
      requestedKeys.push(key)
      if (key.startsWith("/api/challenges/custom-slug?")) {
        return Promise.resolve(
          makeChallenge({
            id: 501,
            slug: "custom-slug",
            title: "Shared Custom Scenario",
            is_public: false,
            is_shared: true,
            is_owner: false,
            share_token: null,
          })
        )
      }
      if (key === "/api/challenges") {
        return Promise.resolve([
          makeChallenge({
            id: 1,
            slug: "recommended-public-sec",
            category: "Security",
            language: "python",
            is_public: true,
            is_solved: false,
          }),
        ])
      }
      if (key === "/api/challenges/custom") {
        return Promise.resolve({
          items: [],
          total: 0,
          quota_limit: 5,
          quota_remaining: 5,
        })
      }
      return Promise.resolve([])
    })

    render(
      <SWRConfig
        value={{
          provider: () => new Map(),
          dedupingInterval: 0,
          shouldRetryOnError: false,
          fetcher,
        }}
      >
        <ArenaLayout slug="custom-slug" shareToken="tok_shared_99" />
      </SWRConfig>
    )

    expect(await screen.findByTestId("arena-layout")).toBeInTheDocument()
    expect(screen.getByTestId("shared-challenge-notice")).toBeInTheDocument()

    expect(requestedKeys).toContain(
      "/api/challenges/custom-slug?share_token=tok_shared_99"
    )
    expect(requestedKeys).toContain(
      "/api/challenges/custom-slug/hints?share_token=tok_shared_99"
    )
    expect(requestedKeys).toContain(
      "/api/challenges/custom-slug/submissions?share_token=tok_shared_99"
    )
    expect(requestedKeys).not.toContain("/api/challenges/custom")
    expect(requestedKeys).not.toContain(
      "/api/challenges/custom-slug/submissions"
    )
  })

  it("propagates shareToken synchronously via ShareTokenProvider to SubmissionHistoryDrawer and ComparisonView", async () => {
    const requestedKeys: string[] = []
    const fetcher = vi.fn((key: string) => {
      requestedKeys.push(key)
      if (key.includes("/solution")) {
        return Promise.resolve({
          id: 501,
          challenge_id: 501,
          slug: "custom-slug",
          canonical_review: "Validate ownership.",
          recommended_fix_diff: "- a\n+ b",
          expected_issues: [],
        })
      }
      return Promise.resolve([])
    })

    render(
      <SWRConfig
        value={{
          provider: () => new Map(),
          dedupingInterval: 0,
          shouldRetryOnError: false,
          fetcher,
        }}
      >
        <ShareTokenProvider slug="custom-slug" shareToken="tok_sync_77">
          <SubmissionHistoryDrawer challengeSlug="custom-slug" asCard />
          <ComparisonView challengeSlug="custom-slug" />
        </ShareTokenProvider>
      </SWRConfig>
    )

    expect(await screen.findByTestId("comparison-view")).toBeInTheDocument()
    expect(requestedKeys).toContain(
      "/api/challenges/custom-slug/submissions?share_token=tok_sync_77"
    )
    expect(requestedKeys).toContain(
      "/api/challenges/custom-slug/solution?reveal=true&share_token=tok_sync_77"
    )
    expect(requestedKeys).not.toContain(
      "/api/challenges/custom-slug/submissions"
    )
  })

  it("clears private challenge screen when revalidation returns 404 after logout", async () => {
    let isLoggedOut = false
    const user = userEvent.setup()
    vi.spyOn(apiClient, "get").mockImplementation((url: string) => {
      if (url === "/api/auth/me") {
        return isLoggedOut
          ? Promise.reject(
              Object.assign(new Error("Unauthorized"), {
                response: { status: 401 },
              })
            )
          : Promise.resolve({
              data: { id: 1, username: "owner", email: "owner@example.com" },
            })
      }
      return Promise.resolve({ data: null })
    })
    vi.spyOn(apiClient, "post").mockImplementation(async (url: string) => {
      if (url === "/api/auth/logout") {
        isLoggedOut = true
        return { data: { message: "ok" } }
      }
      return { data: {} }
    })

    const fetcher = vi.fn((key: string) => {
      if (key === "/api/challenges/private-owner-slug") {
        if (isLoggedOut) {
          const err = Object.assign(new Error("Not Found"), {
            response: { status: 404, data: { detail: "Challenge not found" } },
          })
          return Promise.reject(err)
        }
        return Promise.resolve(
          makeChallenge({
            id: 777,
            slug: "private-owner-slug",
            title: "Owner Secret Custom Draft",
            is_public: false,
            is_owner: true,
            share_token: "owner_secret_tok",
          })
        )
      }
      if (key === "/api/challenges/custom") {
        return Promise.resolve({
          items: [],
          total: 0,
          quota_limit: 5,
          quota_remaining: 5,
        })
      }
      return Promise.resolve([])
    })

    function LogoutButton() {
      const { logout } = useAuth()
      return (
        <button
          type="button"
          onClick={() => {
            void logout()
          }}
        >
          Trigger Logout
        </button>
      )
    }

    render(
      <SWRConfig
        value={{
          provider: () => new Map(),
          dedupingInterval: 0,
          shouldRetryOnError: false,
          fetcher,
        }}
      >
        <LogoutButton />
        <ArenaLayout slug="private-owner-slug" />
      </SWRConfig>
    )

    expect(await screen.findByTestId("arena-layout")).toBeInTheDocument()
    expect(
      screen.getByTestId("custom-challenge-share-panel")
    ).toBeInTheDocument()
    expect(
      screen.getAllByText("Owner Secret Custom Draft").length
    ).toBeGreaterThan(0)

    await user.click(screen.getByRole("button", { name: "Trigger Logout" }))

    expect(await screen.findByText("Challenge Not Found")).toBeInTheDocument()
    expect(
      screen.queryByTestId("custom-challenge-share-panel")
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("Owner Secret Custom Draft")
    ).not.toBeInTheDocument()
  })
})
