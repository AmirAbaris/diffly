import type { ReviewDraft } from "./model"

export const MIN_REVIEW_TEXT_CHARS = 5

export type SubmitBlocker = "no-findings" | "too-little-text"

export interface ReviewValidation {
  readonly valid: boolean
  readonly blockers: readonly SubmitBlocker[]
  readonly totalTextChars: number
  readonly remainingChars: number
}

export function validateReview(draft: ReviewDraft): ReviewValidation {
  const summaryChars = draft.summaryNote.trim().length
  const bodyChars = draft.findings.reduce(
    (sum, finding) => sum + finding.body.trim().length,
    0
  )
  const totalTextChars = summaryChars + bodyChars
  const blockers: SubmitBlocker[] = []

  if (draft.findings.length === 0) {
    blockers.push("no-findings")
  }
  if (totalTextChars < MIN_REVIEW_TEXT_CHARS) {
    blockers.push("too-little-text")
  }

  return {
    valid: blockers.length === 0,
    blockers,
    totalTextChars,
    remainingChars: Math.max(0, MIN_REVIEW_TEXT_CHARS - totalTextChars),
  }
}
