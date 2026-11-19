import * as React from "react"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ArenaLayout } from "@/components/review/arena-layout"
import { ChallengeContextPanel } from "@/components/review/challenge-context-panel"
import { ComparisonView } from "@/components/review/comparison-view"
import { FLAGGING_GUIDE_STORAGE_KEY } from "@/components/review/flagging-guide-modal"
import { SWRProvider } from "@/components/swr-provider"
import { apiClient } from "@/lib/axios"
import { useArenaUIStore } from "@/stores/arena-ui-store"
import { useReviewDraftStore } from "@/stores/review-draft-store"
import type {
  ChallengeDetail,
  ChallengeSolutionResponse,
  ReviewSubmissionResponse,
} from "@/types/challenge"

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => "/challenges/slug-a",
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

describe("ChallengeContextPanel hint persistence", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it("preserves stored hints per slug across mount and slug transitions", async () => {
    window.localStorage.setItem("diffly_hints_slug-a", JSON.stringify([1, 2]))
    window.localStorage.setItem("diffly_hints_slug-b", JSON.stringify([1]))

    const hintsReady = {
      status: "ready" as const,
      data: [
        { tier: 1, label: "Clue 1", text: "Hint 1" },
        { tier: 2, label: "Clue 2", text: "Hint 2" },
        { tier: 3, label: "Clue 3", text: "Hint 3" },
      ],
    }

    const { rerender } = render(
      <ChallengeContextPanel
        challenge={makeChallenge({ slug: "slug-a" })}
        hints={hintsReady}
      />
    )

    expect(screen.getByText("2 of 3 Unlocked")).toBeInTheDocument()
    expect(window.localStorage.getItem("diffly_hints_slug-a")).toBe("[1,2]")

    rerender(
      <ChallengeContextPanel
        challenge={makeChallenge({ slug: "slug-b" })}
        hints={hintsReady}
      />
    )

    expect(screen.getByText("1 of 3 Unlocked")).toBeInTheDocument()
    expect(window.localStorage.getItem("diffly_hints_slug-b")).toBe("[1]")
    expect(window.localStorage.getItem("diffly_hints_slug-a")).toBe("[1,2]")

    const user = userEvent.setup()
    await user.click(screen.getByTestId("unlock-hint-btn-2"))

    expect(screen.getByText("2 of 3 Unlocked")).toBeInTheDocument()
    expect(window.localStorage.getItem("diffly_hints_slug-b")).toBe("[1,2]")
  })

  it("does not write diffly_hints_undefined or wipe stored hints when slug hydrates late", () => {
    window.localStorage.setItem("diffly_hints_slug-a", JSON.stringify([1, 2]))

    const emptyHints = { status: "ready" as const, data: [] }
    const { rerender } = render(
      <ChallengeContextPanel
        challenge={makeChallenge({ slug: "" })}
        hints={emptyHints}
      />
    )

    expect(window.localStorage.getItem("diffly_hints_undefined")).toBeNull()
    expect(window.localStorage.getItem("diffly_hints_")).toBeNull()

    rerender(
      <ChallengeContextPanel
        challenge={makeChallenge({ slug: "slug-a" })}
        hints={emptyHints}
      />
    )

    expect(screen.getByText("2 of 3 Unlocked")).toBeInTheDocument()
    expect(window.localStorage.getItem("diffly_hints_slug-a")).toBe("[1,2]")
  })
})

describe("Arena state reset and keepPreviousData isolation", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem(FLAGGING_GUIDE_STORAGE_KEY, "true")
    useArenaUIStore.getState().resetArenaUI()
    useReviewDraftStore.setState({ drafts: {} })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("resets useArenaUIStore on slug change and unmount", async () => {
    const fetcher = vi.fn((key: string) => {
      if (key === "/api/challenges/slug-a") {
        return Promise.resolve(makeChallenge({ id: 1, slug: "slug-a" }))
      }
      if (key === "/api/challenges/slug-b") {
        return Promise.resolve(makeChallenge({ id: 2, slug: "slug-b" }))
      }
      return Promise.resolve([])
    })

    const cache = new Map()
    const { rerender, unmount } = render(
      <SWRConfig
        value={{ provider: () => cache, dedupingInterval: 0, fetcher }}
      >
        <ArenaLayout slug="slug-a" />
      </SWRConfig>
    )

    expect(await screen.findByTestId("arena-layout")).toBeInTheDocument()

    const mockResult: ReviewSubmissionResponse = {
      id: 10,
      submission_id: 10,
      score: 90,
      feedback: "Good catch",
      detected_issues: [],
      missed_issues: [],
      created_at: "2026-11-19T00:00:00Z",
      flagged_lines: [1],
      comments: "Solid defect explanation",
    }

    act(() => {
      useArenaUIStore.getState().setSubmissionResult(mockResult)
      useArenaUIStore.getState().setIsResultModalOpen(true)
      useArenaUIStore.getState().setIsHistoryOpen(true)
      useArenaUIStore
        .getState()
        .setSubmittedReview({ flaggedLines: [1], comments: "Solid" })
    })

    expect(screen.getByTestId("reopen-comparison-button")).toBeInTheDocument()

    rerender(
      <SWRConfig
        value={{ provider: () => cache, dedupingInterval: 0, fetcher }}
      >
        <ArenaLayout slug="slug-b" />
      </SWRConfig>
    )

    await waitFor(() => {
      expect(useArenaUIStore.getState().submissionResult).toBeNull()
    })
    expect(useArenaUIStore.getState().isResultModalOpen).toBe(false)
    expect(useArenaUIStore.getState().isHistoryOpen).toBe(false)
    expect(useArenaUIStore.getState().submittedReview).toBeNull()
    expect(
      screen.queryByTestId("reopen-comparison-button")
    ).not.toBeInTheDocument()

    act(() => {
      useArenaUIStore.getState().setSubmissionResult(mockResult)
      useArenaUIStore.getState().setIsHistoryOpen(true)
    })

    unmount()

    expect(useArenaUIStore.getState().submissionResult).toBeNull()
    expect(useArenaUIStore.getState().isHistoryOpen).toBe(false)
  })

  it("does not retain previous challenge solution in ComparisonView across slug changes under SWRProvider", async () => {
    let resolveB!: (value: ChallengeSolutionResponse) => void
    const solutionBPromise = new Promise<ChallengeSolutionResponse>((res) => {
      resolveB = res
    })

    vi.spyOn(apiClient, "get").mockImplementation((url: string) => {
      if (url.includes("/slug-a/solution")) {
        return Promise.resolve({
          data: {
            id: 1,
            challenge_id: 1,
            slug: "slug-a",
            canonical_review: "Canonical review for Alpha",
            expected_issues: [],
            recommended_fix_diff: "",
          },
        })
      }
      if (url.includes("/slug-b/solution")) {
        return solutionBPromise.then((data) => ({ data }))
      }
      return Promise.resolve({ data: null })
    })

    const { rerender } = render(
      <SWRProvider>
        <ComparisonView challengeSlug="slug-a" />
      </SWRProvider>
    )

    expect(
      await screen.findByText("Canonical review for Alpha")
    ).toBeInTheDocument()

    rerender(
      <SWRProvider>
        <ComparisonView challengeSlug="slug-b" />
      </SWRProvider>
    )

    expect(
      screen.queryByText("Canonical review for Alpha")
    ).not.toBeInTheDocument()

    await act(async () => {
      resolveB({
        id: 2,
        challenge_id: 2,
        slug: "slug-b",
        canonical_review: "Canonical review for Beta",
        expected_issues: [],
        recommended_fix_diff: "",
      })
    })

    expect(
      await screen.findByText("Canonical review for Beta")
    ).toBeInTheDocument()
  })
})
