import * as React from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CustomChallengeShare } from "@/components/review/context-panel/custom-challenge-share"
import type { ChallengeDetail } from "@/types/challenge"

const mockToggleChallengeShare = vi.fn()

vi.mock("@/hooks/use-custom-challenges", () => ({
  useCustomChallenges: () => ({
    toggleChallengeShare: mockToggleChallengeShare,
  }),
}))

function makeDetail(overrides?: Partial<ChallengeDetail>): ChallengeDetail {
  return {
    id: 42,
    slug: "custom-idor-scenario",
    title: "Custom IDOR Scenario",
    difficulty: "Medium",
    category: "Security",
    language: "python",
    description: "Review custom IDOR scenario",
    threat_model: "Cross-tenant read",
    defect_target: "Spot missing owner filter",
    code_snippet: "def get(id): return store[id]\n",
    estimated_minutes: 5,
    line_count: 1,
    total_hints: 3,
    is_solved: false,
    best_score: null,
    is_public: false,
    is_shared: false,
    share_token: null,
    is_owner: true,
    ...overrides,
  }
}

describe("CustomChallengeShare", () => {
  beforeEach(() => {
    mockToggleChallengeShare.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("renders nothing for public catalog challenges", () => {
    const { container } = render(
      <CustomChallengeShare challenge={makeDetail({ is_public: true })} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("renders read-only notice for non-owner recipients without share controls", () => {
    render(
      <CustomChallengeShare
        challenge={makeDetail({
          is_public: false,
          is_owner: false,
          is_shared: true,
          share_token: null,
        })}
      />
    )

    expect(screen.getByTestId("shared-challenge-notice")).toBeInTheDocument()
    expect(screen.getByText("Unlisted Share")).toBeInTheDocument()
    expect(screen.queryByTestId("enable-share-btn")).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("revoke-share-link-btn")
    ).not.toBeInTheDocument()
  })

  it("allows owner to enable, copy, rotate, and revoke share link", async () => {
    const user = userEvent.setup()
    const writeTextSpy = vi.spyOn(navigator.clipboard, "writeText")
    mockToggleChallengeShare.mockResolvedValueOnce({
      id: 42,
      slug: "custom-idor-scenario",
      is_shared: true,
      share_token: "tok_abc123",
    })

    const { rerender } = render(
      <CustomChallengeShare challenge={makeDetail()} />
    )

    expect(screen.getByText("Private Draft")).toBeInTheDocument()
    await user.click(screen.getByTestId("enable-share-btn"))

    await waitFor(() => {
      expect(mockToggleChallengeShare).toHaveBeenCalledWith(42, true, false)
    })

    rerender(
      <CustomChallengeShare
        challenge={makeDetail({
          is_shared: true,
          share_token: "tok_abc123",
        })}
      />
    )

    expect(screen.getByText("Unlisted Link")).toBeInTheDocument()
    expect(screen.getByTestId("custom-share-url-preview")).toHaveTextContent(
      "/challenges/custom-idor-scenario?share_token=tok_abc123"
    )

    await user.click(screen.getByTestId("copy-share-link-btn"))
    expect(writeTextSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "/challenges/custom-idor-scenario?share_token=tok_abc123"
      )
    )

    mockToggleChallengeShare.mockResolvedValueOnce({
      id: 42,
      slug: "custom-idor-scenario",
      is_shared: true,
      share_token: "tok_rotated",
    })
    await user.click(screen.getByTestId("rotate-share-link-btn"))
    expect(mockToggleChallengeShare).toHaveBeenCalledWith(42, true, true)

    mockToggleChallengeShare.mockResolvedValueOnce({
      id: 42,
      slug: "custom-idor-scenario",
      is_shared: false,
      share_token: null,
    })
    await user.click(screen.getByTestId("revoke-share-link-btn"))
    expect(mockToggleChallengeShare).toHaveBeenCalledWith(42, false, false)
  })
})
