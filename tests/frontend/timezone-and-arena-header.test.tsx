import * as React from "react"
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextDrillButton } from "@/components/review/arena-header/next-drill-button"
import { TimedModeControl } from "@/components/review/arena-header/timed-mode-control"
import { useTimezonePreference } from "@/hooks/use-timezone-preference"
import {
  TIMED_MODE_ENABLED_STORAGE_KEY,
  TIMED_MODE_MINUTES_STORAGE_KEY,
  TIMEZONE_PREFERENCE_STORAGE_KEY,
} from "@/lib/storage-keys"

const mockPush = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
  }),
  usePathname: () => "/challenges/current-slug",
  useSearchParams: () => new URLSearchParams(),
}))

describe("useTimezonePreference hook", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("auto-detects timezone and supports persisted localStorage overrides", () => {
    const resolvedSpy = vi
      .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockReturnValue({
        locale: "en-US",
        calendar: "gregory",
        numberingSystem: "latn",
        timeZone: "Europe/Berlin",
      })

    const { result } = renderHook(() => useTimezonePreference())

    expect(result.current.detectedTimezone).toBe("Europe/Berlin")
    expect(result.current.timezone).toBe("Europe/Berlin")
    expect(result.current.isAuto).toBe(true)

    act(() => {
      result.current.setTimezonePreference("Asia/Tokyo")
    })

    expect(result.current.timezone).toBe("Asia/Tokyo")
    expect(result.current.isAuto).toBe(false)
    expect(window.localStorage.getItem(TIMEZONE_PREFERENCE_STORAGE_KEY)).toBe(
      "Asia/Tokyo"
    )

    act(() => {
      result.current.resetTimezonePreference()
    })

    expect(result.current.timezone).toBe("Europe/Berlin")
    expect(result.current.isAuto).toBe(true)
    expect(
      window.localStorage.getItem(TIMEZONE_PREFERENCE_STORAGE_KEY)
    ).toBeNull()

    resolvedSpy.mockRestore()
  })
})

describe("TimedModeControl & NextDrillButton", () => {
  beforeEach(() => {
    window.localStorage.clear()
    mockPush.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("toggles timed mode, persists preset, transitions warning/expired states, and announces milestones", () => {
    vi.useFakeTimers()

    render(<TimedModeControl />)

    expect(screen.queryByTestId("timed-mode-countdown")).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId("timed-preset-trigger"))
    fireEvent.click(screen.getByTestId("timed-preset-5"))
    expect(window.localStorage.getItem(TIMED_MODE_MINUTES_STORAGE_KEY)).toBe(
      "5"
    )

    fireEvent.click(screen.getByTestId("timed-mode-toggle"))
    expect(window.localStorage.getItem(TIMED_MODE_ENABLED_STORAGE_KEY)).toBe(
      "true"
    )

    const countdown = screen.getByTestId("timed-mode-countdown")
    expect(countdown).toHaveTextContent("05:00")
    expect(countdown).toHaveAttribute("data-state", "normal")
    expect(screen.getByTestId("timed-mode-live-region")).toHaveTextContent(
      "Timer started for 5 minutes"
    )

    act(() => {
      vi.advanceTimersByTime(4 * 60 * 1000 + 1000)
    })

    expect(screen.getByTestId("timed-mode-countdown")).toHaveTextContent(
      "00:59"
    )
    expect(screen.getByTestId("timed-mode-countdown")).toHaveAttribute(
      "data-state",
      "warning"
    )

    act(() => {
      vi.advanceTimersByTime(29 * 1000)
    })

    expect(screen.getByTestId("timed-mode-countdown")).toHaveTextContent(
      "00:30"
    )
    expect(screen.getByTestId("timed-mode-live-region")).toHaveTextContent(
      "30 seconds remaining"
    )

    act(() => {
      vi.advanceTimersByTime(30 * 1000)
    })

    expect(screen.getByTestId("timed-mode-countdown")).toHaveTextContent(
      "00:00"
    )
    expect(screen.getByTestId("timed-mode-countdown")).toHaveTextContent(
      "Time's up"
    )
    expect(screen.getByTestId("timed-mode-countdown")).toHaveAttribute(
      "data-state",
      "expired"
    )
    expect(screen.getByTestId("timed-mode-live-region")).toHaveTextContent(
      "Time's up"
    )
  })

  it("fetches /api/challenges/next?exclude=<slug>, shows reason in tooltip, and navigates on click", async () => {
    const user = userEvent.setup()

    const fetcher = vi.fn(async (key: string) => {
      if (key === "/api/challenges/next?exclude=current-slug") {
        return {
          challenge: {
            id: 2,
            slug: "sql-sink-audit",
            title: "SQL Sink Audit",
            difficulty: "Hard",
            category: "Security",
            language: "python",
            description: "Find the sink",
            estimated_minutes: 10,
            line_count: 42,
            total_hints: 3,
            is_solved: false,
            best_score: null,
          },
          reason: "weak_category",
          due_at: null,
          category_mastery: 35,
          review_interval_days: null,
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
        <NextDrillButton currentSlug="current-slug" />
      </SWRConfig>
    )

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(
        "/api/challenges/next?exclude=current-slug"
      )
    })

    const nextButton = screen.getByTestId("next-drill-button")
    await user.hover(nextButton)

    const tooltip = await screen.findByTestId("next-drill-tooltip")
    expect(tooltip).toHaveTextContent("Targets a weak category")
    expect(tooltip).toHaveTextContent("SQL Sink Audit")

    await user.click(nextButton)
    expect(mockPush).toHaveBeenCalledWith("/challenges/sql-sink-audit")
  })
})
