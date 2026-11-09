import * as React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ChallengeCard } from "@/components/challenges/challenge-card"
import type { ChallengeSummary } from "@/types/challenge"

const pushMock = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}))

const baseChallenge: ChallengeSummary = {
  id: 1,
  slug: "tool-loop-without-termination",
  title: "Tool Loop Without Termination",
  difficulty: "Easy",
  category: "Agent Antipaths",
  language: "python",
  description:
    "An AI agent enters an infinite recursion loop when handling tool call retries.",
  estimated_minutes: 5,
  line_count: 42,
  total_hints: 3,
  is_solved: false,
  best_score: null,
}

describe("ChallengeCard Component", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders title, category, language, and technical metadata correctly", () => {
    render(<ChallengeCard challenge={baseChallenge} />)

    expect(
      screen.getByText("Tool Loop Without Termination")
    ).toBeInTheDocument()
    expect(screen.getByText("Agent Antipaths")).toBeInTheDocument()
    expect(screen.getByText("Python")).toBeInTheDocument()
    expect(screen.getByText("~5 min")).toBeInTheDocument()
    expect(screen.getByText("42 loc")).toBeInTheDocument()
    expect(screen.getByText("3 hints")).toBeInTheDocument()
    expect(screen.getByText("Start Review")).toBeInTheDocument()
  })

  it("renders difficulty badge with emerald indicator for Easy", () => {
    render(<ChallengeCard challenge={baseChallenge} />)

    const badge = screen.getByTestId("difficulty-badge-easy")
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent("Easy")
  })

  it("renders difficulty badge with amber indicator for Medium", () => {
    render(
      <ChallengeCard challenge={{ ...baseChallenge, difficulty: "Medium" }} />
    )

    const badge = screen.getByTestId("difficulty-badge-medium")
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent("Medium")
  })

  it("renders difficulty badge with rose indicator for Hard", () => {
    render(
      <ChallengeCard challenge={{ ...baseChallenge, difficulty: "Hard" }} />
    )

    const badge = screen.getByTestId("difficulty-badge-hard")
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent("Hard")
  })

  it("renders green Solved (Score%) badge and 'Review Again' button when is_solved is true", () => {
    render(
      <ChallengeCard
        challenge={{
          ...baseChallenge,
          is_solved: true,
          best_score: 95,
        }}
      />
    )

    const solvedBadge = screen.getByTestId("completion-badge-solved")
    expect(solvedBadge).toBeInTheDocument()
    expect(solvedBadge).toHaveTextContent("Solved (95%)")
    expect(screen.getByText("Review Again")).toBeInTheDocument()
    expect(screen.queryByText("Start Review")).not.toBeInTheDocument()
  })

  it("renders Attempted (Score%) badge when not solved but has a best_score", () => {
    render(
      <ChallengeCard
        challenge={{
          ...baseChallenge,
          is_solved: false,
          best_score: 60,
        }}
      />
    )

    const attemptedBadge = screen.getByTestId("completion-badge-attempted")
    expect(attemptedBadge).toBeInTheDocument()
    expect(attemptedBadge).toHaveTextContent("Attempted (60%)")
    expect(screen.getByText("Start Review")).toBeInTheDocument()
  })

  it("does not render completion badge when unattempted", () => {
    render(<ChallengeCard challenge={baseChallenge} />)

    expect(
      screen.queryByTestId("completion-badge-solved")
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("completion-badge-attempted")
    ).not.toBeInTheDocument()
  })

  it("renders TypeScript language pill accurately", () => {
    render(
      <ChallengeCard
        challenge={{
          ...baseChallenge,
          language: "typescript",
        }}
      />
    )

    expect(screen.getByText("TypeScript")).toBeInTheDocument()
  })

  it("supports keyboard navigation on Enter key", () => {
    render(<ChallengeCard challenge={baseChallenge} />)

    const card = screen.getByTestId(`challenge-card-${baseChallenge.slug}`)
    card.focus()
    fireEvent.keyDown(card, { key: "Enter" })

    expect(pushMock).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith(`/challenges/${baseChallenge.slug}`)
  })
})
