import * as React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ReviewCommentEditor } from "@/components/review/review-comment-editor"
import { SubmissionBar } from "@/components/review/submission-bar"
import { MIN_REVIEW_COMMENT_CHARS } from "@/lib/review-validation"

describe("Unified review submit validation", () => {
  afterEach(() => {
    cleanup()
  })

  it("requires >= 1 flagged line and >= MIN_REVIEW_COMMENT_CHARS trimmed characters in both ReviewCommentEditor and SubmissionBar", () => {
    const validComment = "a".repeat(MIN_REVIEW_COMMENT_CHARS)
    const shortComment = "a".repeat(MIN_REVIEW_COMMENT_CHARS - 1)

    const { rerender } = render(
      <>
        <ReviewCommentEditor
          flaggedLines={[]}
          onToggleLine={vi.fn()}
          comment={validComment}
          onChangeComment={vi.fn()}
          onSubmitReview={vi.fn()}
        />
        <SubmissionBar
          flaggedLines={[]}
          comments={validComment}
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

    const buttonsNoLines = screen.getAllByRole("button", {
      name: /submit review/i,
    })
    expect(buttonsNoLines).toHaveLength(2)
    buttonsNoLines.forEach((btn) => expect(btn).toBeDisabled())

    rerender(
      <>
        <ReviewCommentEditor
          flaggedLines={[1]}
          onToggleLine={vi.fn()}
          comment={shortComment}
          onChangeComment={vi.fn()}
          onSubmitReview={vi.fn()}
        />
        <SubmissionBar
          flaggedLines={[1]}
          comments={shortComment}
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

    screen
      .getAllByRole("button", { name: /submit review/i })
      .forEach((btn) => expect(btn).toBeDisabled())

    rerender(
      <>
        <ReviewCommentEditor
          flaggedLines={[1]}
          onToggleLine={vi.fn()}
          comment="     a  "
          onChangeComment={vi.fn()}
          onSubmitReview={vi.fn()}
        />
        <SubmissionBar
          flaggedLines={[1]}
          comments="     a  "
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

    screen
      .getAllByRole("button", { name: /submit review/i })
      .forEach((btn) => expect(btn).toBeDisabled())

    rerender(
      <>
        <ReviewCommentEditor
          flaggedLines={[1]}
          onToggleLine={vi.fn()}
          comment={validComment}
          onChangeComment={vi.fn()}
          onSubmitReview={vi.fn()}
        />
        <SubmissionBar
          flaggedLines={[1]}
          comments={validComment}
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

    screen
      .getAllByRole("button", { name: /submit review/i })
      .forEach((btn) => expect(btn).toBeEnabled())
  })
})
