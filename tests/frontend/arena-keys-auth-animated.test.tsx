import * as React from "react"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ComparisonView } from "@/components/review/comparison-view"
import { StaffReviewColumn } from "@/components/review/comparison/staff-review-column"
import { DetectedDefectsSection } from "@/components/review/result-modal/detected-defects"
import { MissedDefectsSection } from "@/components/review/result-modal/missed-defects"
import { FormattedInlineText } from "@/components/review/result-modal/score-helpers"
import { useAnimatedNumber } from "@/hooks/use-animated-number"
import { useSubmissionHistory } from "@/hooks/use-submission-history"
import { useAuth } from "@/lib/auth"
import { apiClient } from "@/lib/axios"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))

describe("Stable index-qualified React keys", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("renders repeated inline tokens and keywords without duplicate React key warnings", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    render(
      <div>
        <FormattedInlineText text="Use `eval` and `eval` safely **now** and **now**" />
        <DetectedDefectsSection
          issues={[
            {
              id: "rce",
              title: "RCE",
              severity: "critical",
              matched_lines: [1],
              matched_keywords: ["eval", "eval"],
            },
          ]}
        />
        <MissedDefectsSection
          issues={[
            {
              id: "sqli",
              title: "SQLi",
              severity: "high",
              expected_lines: [2],
              missing_keywords: ["sql", "sql"],
            },
          ]}
        />
        <StaffReviewColumn
          solution={{
            id: 1,
            challenge_id: 1,
            slug: "slug-a",
            canonical_review: "Canonical",
            expected_issues: [
              {
                id: "xss",
                title: "XSS",
                severity: "medium",
                lines: [3],
                keywords: ["xss", "xss"],
                explanation: "Escape output",
              },
            ],
            recommended_fix_diff: "",
          }}
          onOpenDiff={vi.fn()}
        />
      </div>
    )

    const duplicateKeyWarnings = errorSpy.mock.calls.filter((args) =>
      args.some(
        (arg) =>
          typeof arg === "string" &&
          arg.includes("Encountered two children with the same key")
      )
    )
    expect(duplicateKeyWarnings).toHaveLength(0)
  })
})

describe("useAnimatedNumber interrupted interpolation", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("interpolates from current animated value instead of jumping backward on interruption", () => {
    let now = 0
    vi.spyOn(performance, "now").mockImplementation(() => now)

    let nextFrameId = 0
    const pendingFrames = new Map<number, FrameRequestCallback>()
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      const id = ++nextFrameId
      pendingFrames.set(id, cb)
      return id
    })
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      pendingFrames.delete(id)
    })

    const flushNextFrame = (timestamp: number) => {
      const next = pendingFrames.entries().next()
      if (next.done) return
      const [id, cb] = next.value
      pendingFrames.delete(id)
      now = timestamp
      cb(timestamp)
    }

    function AnimatedProbe({
      target,
      duration = 1000,
    }: {
      target: number
      duration?: number
    }) {
      const value = useAnimatedNumber(target, duration)
      return <span data-testid="animated-value">{value}</span>
    }

    const { rerender } = render(<AnimatedProbe target={0} />)
    expect(screen.getByTestId("animated-value")).toHaveTextContent("0")

    rerender(<AnimatedProbe target={100} />)
    expect(pendingFrames.size).toBeGreaterThan(0)

    act(() => {
      flushNextFrame(500)
    })

    const midValue = Number(
      screen.getByTestId("animated-value").textContent ?? "0"
    )
    expect(midValue).toBeGreaterThan(50)
    expect(midValue).toBeLessThan(100)

    rerender(<AnimatedProbe target={80} />)

    act(() => {
      flushNextFrame(516)
    })

    const afterInterrupt = Number(
      screen.getByTestId("animated-value").textContent ?? "0"
    )
    expect(afterInterrupt).toBeGreaterThanOrEqual(80)
    expect(afterInterrupt).toBeLessThanOrEqual(midValue)

    rerender(<AnimatedProbe target={42} duration={0} />)
    expect(screen.getByTestId("animated-value")).toHaveTextContent("42")
  })
})

describe("Auth SWR cache invalidation across challenge-scoped keys", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("revalidates challenge-scoped /submissions and /solution keys on login, register, and logout", async () => {
    const fetchCounts: Record<string, number> = {}
    const fetcher = vi.fn((key: string) => {
      fetchCounts[key] = (fetchCounts[key] ?? 0) + 1
      if (key === "/api/auth/me") return Promise.resolve(null)
      if (key === "/api/challenges/slug-a/submissions") {
        return Promise.resolve([{ id: 1, score: 80 }])
      }
      if (key === "/api/challenges/slug-a/solution?reveal=true") {
        return Promise.resolve({
          id: 1,
          challenge_id: 1,
          slug: "slug-a",
          canonical_review: "Canonical",
          expected_issues: [],
          recommended_fix_diff: "",
        })
      }
      return Promise.resolve(null)
    })

    vi.spyOn(apiClient, "post").mockImplementation((url: string) => {
      if (url === "/api/auth/login" || url === "/api/auth/register") {
        return Promise.resolve({
          data: { id: 1, username: "alice", email: "alice@example.com" },
          headers: {},
        })
      }
      return Promise.resolve({ data: { message: "ok" }, headers: {} })
    })

    let authActions!: ReturnType<typeof useAuth>

    function AuthProbe() {
      authActions = useAuth()
      useSubmissionHistory("slug-a")
      return null
    }

    render(
      <SWRConfig
        value={{ provider: () => new Map(), dedupingInterval: 0, fetcher }}
      >
        <AuthProbe />
        <ComparisonView challengeSlug="slug-a" />
      </SWRConfig>
    )

    await waitFor(() => {
      expect(fetchCounts["/api/challenges/slug-a/solution?reveal=true"]).toBe(1)
      expect(fetchCounts["/api/challenges/slug-a/submissions"]).toBe(1)
    })

    await act(async () => {
      await authActions.login({ emailOrUsername: "alice", password: "secret" })
    })

    await waitFor(() => {
      expect(
        fetchCounts["/api/challenges/slug-a/solution?reveal=true"]
      ).toBeGreaterThanOrEqual(2)
      expect(
        fetchCounts["/api/challenges/slug-a/submissions"]
      ).toBeGreaterThanOrEqual(2)
    })

    const beforeRegisterSolutions =
      fetchCounts["/api/challenges/slug-a/solution?reveal=true"]
    const beforeRegisterSubmissions =
      fetchCounts["/api/challenges/slug-a/submissions"]

    await act(async () => {
      await authActions.register({
        email: "alice@example.com",
        username: "alice",
        password: "secret",
      })
    })

    await waitFor(() => {
      expect(
        fetchCounts["/api/challenges/slug-a/solution?reveal=true"]
      ).toBeGreaterThan(beforeRegisterSolutions)
      expect(fetchCounts["/api/challenges/slug-a/submissions"]).toBeGreaterThan(
        beforeRegisterSubmissions
      )
    })

    const beforeLogoutSolutions =
      fetchCounts["/api/challenges/slug-a/solution?reveal=true"]
    const beforeLogoutSubmissions =
      fetchCounts["/api/challenges/slug-a/submissions"]

    await act(async () => {
      await authActions.logout()
    })

    await waitFor(() => {
      expect(
        fetchCounts["/api/challenges/slug-a/solution?reveal=true"]
      ).toBeGreaterThan(beforeLogoutSolutions)
      expect(fetchCounts["/api/challenges/slug-a/submissions"]).toBeGreaterThan(
        beforeLogoutSubmissions
      )
    })
  })
})
