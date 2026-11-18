import * as React from "react"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ArenaLayout } from "@/components/review/arena-layout"
import { FLAGGING_GUIDE_STORAGE_KEY } from "@/components/review/flagging-guide-modal"
import { parseChallengeLoadError } from "@/hooks/use-challenge-session"
import { useArenaUIStore } from "@/stores/arena-ui-store"
import { useReviewDraftStore } from "@/stores/review-draft-store"
import type { ChallengeDetail } from "@/types/challenge"

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

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

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

function renderWithSWR(
  ui: React.ReactElement,
  fetcher: (key: string) => Promise<unknown>
) {
  const cache = new Map()
  return render(
    <SWRConfig
      value={{
        provider: () => cache,
        keepPreviousData: true,
        dedupingInterval: 0,
        shouldRetryOnError: false,
        fetcher,
      }}
    >
      {ui}
    </SWRConfig>
  )
}

describe("ArenaLayout", () => {
  beforeEach(() => {
    window.localStorage.clear()
    useArenaUIStore.getState().resetArenaUI()
    useReviewDraftStore.setState({ drafts: {} })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("renders ArenaLoadingShell on cold load and transitions to ready workspace", async () => {
    const challengeDeferred = createDeferred<ChallengeDetail>()

    const fetcher = vi.fn((key: string) => {
      if (key === "/api/challenges/slug-a") return challengeDeferred.promise
      if (key === "/api/challenges/slug-a/hints") return Promise.resolve([])
      if (key === "/api/challenges/slug-a/submissions") {
        return Promise.resolve([])
      }
      if (key === "/api/challenges") return Promise.resolve([])
      return Promise.resolve(null)
    })

    renderWithSWR(<ArenaLayout slug="slug-a" />, fetcher)

    expect(screen.getByTestId("arena-loading-shell")).toBeInTheDocument()
    expect(screen.getByTestId("code-viewer-loading")).toBeInTheDocument()
    expect(
      screen.getByTestId("challenge-context-panel-loading")
    ).toBeInTheDocument()
    expect(
      screen.getByTestId("arena-comment-drawer-loading")
    ).toBeInTheDocument()
    expect(screen.getByTestId("submission-bar-loading")).toBeInTheDocument()
    expect(screen.queryByTestId("code-viewer")).not.toBeInTheDocument()
    expect(screen.queryByText("solution.py")).not.toBeInTheDocument()
    expect(screen.queryByTestId("flagging-guide-modal")).not.toBeInTheDocument()

    const challengeA = makeChallenge({
      id: 1,
      slug: "slug-a",
      title: "Alpha SQL Flaw",
      description: "Alpha scenario description text",
      code_snippet: "def alpha_bug():\n    return 42",
    })

    await act(async () => {
      challengeDeferred.resolve(challengeA)
    })

    expect(await screen.findByTestId("arena-layout")).toBeInTheDocument()
    expect(screen.queryByTestId("arena-loading-shell")).not.toBeInTheDocument()
    expect(screen.getByTestId("code-viewer")).toBeInTheDocument()
    expect(screen.getByText(/alpha_bug/)).toBeInTheDocument()
    expect(
      screen.getByText("Alpha scenario description text")
    ).toBeInTheDocument()
    expect(
      await screen.findByTestId("flagging-guide-modal")
    ).toBeInTheDocument()
  })

  it("hides previous slug code and shows loading shell during slug-to-slug navigation", async () => {
    window.localStorage.setItem(FLAGGING_GUIDE_STORAGE_KEY, "true")

    const challengeADeferred = createDeferred<ChallengeDetail>()
    const challengeBDeferred = createDeferred<ChallengeDetail>()

    const fetcher = vi.fn((key: string) => {
      if (key === "/api/challenges/slug-a") return challengeADeferred.promise
      if (key === "/api/challenges/slug-b") return challengeBDeferred.promise
      if (key.endsWith("/hints") || key.endsWith("/submissions")) {
        return Promise.resolve([])
      }
      if (key === "/api/challenges") return Promise.resolve([])
      return Promise.resolve(null)
    })

    const cache = new Map()
    const { rerender } = render(
      <SWRConfig
        value={{
          provider: () => cache,
          keepPreviousData: true,
          dedupingInterval: 0,
          shouldRetryOnError: false,
          fetcher,
        }}
      >
        <ArenaLayout slug="slug-a" />
      </SWRConfig>
    )

    await act(async () => {
      challengeADeferred.resolve(
        makeChallenge({
          id: 1,
          slug: "slug-a",
          title: "Challenge A",
          description: "Description for A",
          code_snippet: "def alpha_only_fn():\n    pass",
        })
      )
    })

    expect(await screen.findByText(/alpha_only_fn/)).toBeInTheDocument()

    rerender(
      <SWRConfig
        value={{
          provider: () => cache,
          keepPreviousData: true,
          dedupingInterval: 0,
          shouldRetryOnError: false,
          fetcher,
        }}
      >
        <ArenaLayout slug="slug-b" />
      </SWRConfig>
    )

    expect(screen.getByTestId("arena-loading-shell")).toBeInTheDocument()
    expect(screen.getByTestId("code-viewer-loading")).toBeInTheDocument()
    expect(
      screen.getByTestId("challenge-context-panel-loading")
    ).toBeInTheDocument()
    expect(screen.queryByText(/alpha_only_fn/)).not.toBeInTheDocument()
    expect(screen.queryByText("Description for A")).not.toBeInTheDocument()

    await act(async () => {
      challengeBDeferred.resolve(
        makeChallenge({
          id: 2,
          slug: "slug-b",
          title: "Challenge B",
          description: "Description for B",
          code_snippet: "def beta_only_fn():\n    pass",
        })
      )
    })

    expect(await screen.findByText(/beta_only_fn/)).toBeInTheDocument()
    expect(screen.getByText("Description for B")).toBeInTheDocument()
    expect(screen.queryByText(/alpha_only_fn/)).not.toBeInTheDocument()
  })

  it("renders non-retryable 404 error view with Back to Catalog link", async () => {
    const fetcher = vi.fn((key: string) => {
      if (key === "/api/challenges/missing-slug") {
        return Promise.reject({
          response: {
            status: 404,
            data: { detail: "Challenge does not exist." },
          },
        })
      }
      return Promise.resolve([])
    })

    renderWithSWR(<ArenaLayout slug="missing-slug" />, fetcher)

    expect(await screen.findByTestId("arena-error-view")).toBeInTheDocument()
    expect(screen.getByText("Challenge Not Found")).toBeInTheDocument()
    expect(screen.getByText("Challenge does not exist.")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /try again/i })
    ).not.toBeInTheDocument()

    const catalogLinks = screen.getAllByRole("link", { name: /catalog/i })
    expect(
      catalogLinks.some((el) => el.getAttribute("href") === "/challenges")
    ).toBe(true)
  })

  it("renders retryable 500 error view and recovers when Try Again is clicked", async () => {
    window.localStorage.setItem(FLAGGING_GUIDE_STORAGE_KEY, "true")

    let attempt = 0
    const fetcher = vi.fn((key: string) => {
      if (key === "/api/challenges/flaky-slug") {
        attempt += 1
        if (attempt === 1) {
          return Promise.reject({
            response: {
              status: 500,
              data: { detail: "Upstream timeout" },
            },
          })
        }
        return Promise.resolve(
          makeChallenge({
            id: 7,
            slug: "flaky-slug",
            title: "Recovered Challenge",
            description: "Recovered overview",
            code_snippet: "def recovered_fn():\n    return True",
          })
        )
      }
      if (key.endsWith("/hints") || key.endsWith("/submissions")) {
        return Promise.resolve([])
      }
      return Promise.resolve([])
    })

    const user = userEvent.setup()
    renderWithSWR(<ArenaLayout slug="flaky-slug" />, fetcher)

    expect(await screen.findByTestId("arena-error-view")).toBeInTheDocument()
    expect(screen.getByText("Failed to Load Challenge")).toBeInTheDocument()
    expect(screen.getByText("Upstream timeout")).toBeInTheDocument()

    const retryButton = screen.getByRole("button", { name: /try again/i })
    await user.click(retryButton)

    await waitFor(() => {
      expect(screen.getByTestId("arena-layout")).toBeInTheDocument()
    })
    expect(screen.getByText(/recovered_fn/)).toBeInTheDocument()
  })
})

describe("parseChallengeLoadError", () => {
  it("maps HTTP and network errors into retryable domain errors", () => {
    expect(
      parseChallengeLoadError({ response: { status: 404 } }, "missing")
    ).toMatchObject({ kind: "not-found", retryable: false })

    expect(
      parseChallengeLoadError({ response: { status: 401 } }, "auth")
    ).toMatchObject({ kind: "unauthorized", retryable: false })

    expect(
      parseChallengeLoadError(
        { code: "ERR_NETWORK", message: "Offline" },
        "net"
      )
    ).toMatchObject({ kind: "network", retryable: true })

    expect(
      parseChallengeLoadError({ response: { status: 503 } }, "srv")
    ).toMatchObject({ kind: "server", retryable: true })
  })
})
