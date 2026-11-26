import * as React from "react"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SubmissionBar } from "@/components/review/submission-bar"
import { ReviewSummaryPanel } from "@/components/review/summary/review-summary-panel"
import { asFindingId, type ReviewDraft } from "@/lib/review"

function makeDraft(overrides: Partial<ReviewDraft> = {}): ReviewDraft {
  return {
    findings: [],
    summaryNote: "",
    ...overrides,
  }
}

function ControlledSummaryHarness({
  initialDraft,
}: {
  initialDraft: ReviewDraft
}) {
  const [draft, setDraft] = React.useState<ReviewDraft>(initialDraft)

  return (
    <ReviewSummaryPanel
      draft={draft}
      onChangeSummaryNote={(summaryNote) =>
        setDraft((prev) => ({ ...prev, summaryNote }))
      }
      onSelectFinding={vi.fn()}
      onRemoveFinding={vi.fn()}
    />
  )
}

describe("ReviewSummaryPanel", () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("collapses the optional summary editor by default when summaryNote is empty", () => {
    render(
      <ReviewSummaryPanel
        draft={makeDraft()}
        onChangeSummaryNote={vi.fn()}
        onSelectFinding={vi.fn()}
        onRemoveFinding={vi.fn()}
      />
    )

    const trigger = screen.getByTestId("toggle-summary-note")
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveTextContent("Add overall summary")
    expect(trigger).toHaveTextContent("Optional")
    expect(trigger).toHaveTextContent("Not required when explained inline")
    expect(
      screen.queryByLabelText("Review summary note")
    ).not.toBeInTheDocument()
  })

  it("expands SummaryNoteEditor when clicking the optional trigger and allows typing", async () => {
    const user = userEvent.setup()
    render(<ControlledSummaryHarness initialDraft={makeDraft()} />)

    const trigger = screen.getByTestId("toggle-summary-note")
    await user.click(trigger)

    expect(trigger).toHaveTextContent("Overall summary")
    const textarea = screen.getByLabelText("Review summary note")
    expect(textarea).toBeVisible()

    await user.type(textarea, "Cross-cutting auth issue")
    expect(textarea).toHaveValue("Cross-cutting auth issue")
  })

  it("starts expanded when draft.summaryNote is already non-empty and can still collapse", async () => {
    const user = userEvent.setup()
    render(
      <ControlledSummaryHarness
        initialDraft={makeDraft({ summaryNote: "Restored overall note" })}
      />
    )

    const trigger = screen.getByTestId("toggle-summary-note")
    const textarea = screen.getByLabelText("Review summary note")
    expect(textarea).toBeVisible()
    expect(textarea).toHaveValue("Restored overall note")

    await user.click(trigger)
    expect(
      screen.queryByLabelText("Review summary note")
    ).not.toBeInTheDocument()
    expect(trigger).toHaveTextContent("Added")
    expect(trigger).toHaveTextContent("Click to view or edit")
  })

  it("enables Submit Review in SubmissionBar with inline-only findings and empty summaryNote", () => {
    const draft = makeDraft({
      findings: [
        {
          id: asFindingId("f-1"),
          anchor: { file: null, start: 12, end: 12 },
          body: "Unsanitized user input reaches SQL execution.",
          severity: "high",
        },
      ],
      summaryNote: "",
    })

    render(
      <>
        <ReviewSummaryPanel
          draft={draft}
          onChangeSummaryNote={vi.fn()}
          onSelectFinding={vi.fn()}
          onRemoveFinding={vi.fn()}
        />
        <SubmissionBar
          reviewDraft={draft}
          flaggedLines={[12]}
          comments=""
          onResetDraft={vi.fn()}
          onOpenFlagGuide={vi.fn()}
          onSubmitReview={vi.fn()}
          onViewResults={vi.fn()}
          onOpenHistory={vi.fn()}
          attemptCount={0}
          hasSubmitted={false}
          isSubmitting={false}
        />
      </>
    )

    expect(
      screen.queryByLabelText("Review summary note")
    ).not.toBeInTheDocument()

    const submissionBar = screen.getByTestId("submission-bar")
    const submitButton = within(submissionBar).getByRole("button", {
      name: /submit review/i,
    })
    expect(submitButton).toBeEnabled()
  })

  it("does not render a duplicate Submit Review button inside ReviewSummaryPanel", () => {
    const draft = makeDraft({
      findings: [
        {
          id: asFindingId("f-2"),
          anchor: { file: null, start: 5, end: 5 },
          body: "Missing authorization check before mutation.",
          severity: null,
        },
      ],
      summaryNote: "Summary text",
    })

    render(
      <ReviewSummaryPanel
        draft={draft}
        onChangeSummaryNote={vi.fn()}
        onSelectFinding={vi.fn()}
        onRemoveFinding={vi.fn()}
      />
    )

    const summaryPanel = screen.getByTestId("review-summary-panel")
    expect(
      within(summaryPanel).queryByRole("button", { name: /submit review/i })
    ).not.toBeInTheDocument()
  })
})
