import * as React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ReviewResultModal } from "@/components/review/review-result-modal"
import type { ReviewSubmissionResponse } from "@/types/challenge"

const mockPush = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/challenges/sample-challenge",
}))

describe("ReviewResultModal Component", () => {
  beforeEach(() => {
    mockPush.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  const sampleResult: ReviewSubmissionResponse = {
    id: 101,
    submission_id: 101,
    score: 85,
    flagged_lines: [5, 6],
    comments: "Potential arbitrary code execution via eval()",
    detected_issues: [
      {
        id: "crit-rce",
        title: "Arbitrary Code Execution via eval()",
        severity: "critical",
        matched_lines: [5, 6],
      },
    ],
    missed_issues: [
      {
        id: "warn-input",
        title: "Lack of input validation",
        severity: "medium",
        expected_lines: [10],
      },
    ],
    feedback:
      "High accuracy! Found primary defect. Penalty: -5 for extra line.",
    created_at: "2026-11-12T00:00:00Z",
  }

  it("renders nothing when result is null", () => {
    const { container } = render(
      <ReviewResultModal
        open={true}
        onOpenChange={vi.fn()}
        result={null}
        challengeSlug="sample-challenge"
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("renders score, title, detected and missed defects", async () => {
    render(
      <ReviewResultModal
        open={true}
        onOpenChange={vi.fn()}
        result={sampleResult}
        challengeSlug="sample-challenge"
        challengeTitle="Agent Unsanitized Execution"
      />
    )

    expect(await screen.findByTestId("review-result-modal")).toBeInTheDocument()
    expect(screen.getByText("Evaluation Results")).toBeInTheDocument()
    expect(
      screen.getByText("Assessment for Agent Unsanitized Execution")
    ).toBeInTheDocument()

    // Score display
    expect(screen.getByText("85")).toBeInTheDocument()

    // Detected defects column
    expect(screen.getByText(/Detected Defects/i)).toBeInTheDocument()
    expect(
      screen.getByText("Arbitrary Code Execution via eval()")
    ).toBeInTheDocument()

    // Missed defects column
    expect(screen.getByText(/Missed Defects/i)).toBeInTheDocument()
    expect(screen.getByText("Lack of input validation")).toBeInTheDocument()
  })

  it("handles Try Again button click", async () => {
    const onTryAgainMock = vi.fn()
    const onOpenChangeMock = vi.fn()
    const user = userEvent.setup()

    render(
      <ReviewResultModal
        open={true}
        onOpenChange={onOpenChangeMock}
        result={sampleResult}
        challengeSlug="sample-challenge"
        onTryAgain={onTryAgainMock}
      />
    )

    const tryAgainButton = await screen.findByTestId("try-again-button")
    await user.click(tryAgainButton)

    expect(onOpenChangeMock).toHaveBeenCalledWith(false)
    expect(onTryAgainMock).toHaveBeenCalledTimes(1)
  })

  it("handles Next Challenge navigation", async () => {
    const onNextChallengeMock = vi.fn()
    const onOpenChangeMock = vi.fn()
    const user = userEvent.setup()

    render(
      <ReviewResultModal
        open={true}
        onOpenChange={onOpenChangeMock}
        result={sampleResult}
        challengeSlug="sample-challenge"
        nextChallengeSlug="next-prompt-injection"
        onNextChallenge={onNextChallengeMock}
      />
    )

    const nextButton = await screen.findByTestId("next-challenge-button")
    await user.click(nextButton)

    expect(onOpenChangeMock).toHaveBeenCalledWith(false)
    expect(onNextChallengeMock).toHaveBeenCalledTimes(1)
  })

  it("navigates via router.push when onNextChallenge is not provided", async () => {
    const user = userEvent.setup()

    render(
      <ReviewResultModal
        open={true}
        onOpenChange={vi.fn()}
        result={sampleResult}
        challengeSlug="sample-challenge"
        nextChallengeSlug="next-prompt-injection"
      />
    )

    const nextButton = await screen.findByTestId("next-challenge-button")
    await user.click(nextButton)

    expect(mockPush).toHaveBeenCalledWith("/challenges/next-prompt-injection")
  })

  it("toggles canonical solution panel visibility", async () => {
    const onViewCanonicalMock = vi.fn()
    const user = userEvent.setup()

    render(
      <ReviewResultModal
        open={true}
        onOpenChange={vi.fn()}
        result={sampleResult}
        challengeSlug="sample-challenge"
        onViewCanonicalSolution={onViewCanonicalMock}
      />
    )

    expect(
      screen.queryByTestId("canonical-solution-panel")
    ).not.toBeInTheDocument()

    const toggleButton = await screen.findByTestId(
      "view-canonical-solution-button"
    )
    await user.click(toggleButton)

    expect(onViewCanonicalMock).toHaveBeenCalledTimes(1)
    expect(
      await screen.findByTestId("canonical-solution-panel")
    ).toBeInTheDocument()
  })
})
