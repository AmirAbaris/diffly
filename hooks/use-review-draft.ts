"use client"

import * as React from "react"
import {
  buildUnboundedLineSpace,
  expandFlaggedLines,
  toLineRef,
  validateReview,
  type CommandOutcome,
  type LineSpace,
  type ReviewCommand,
  type ReviewDraft,
  type ReviewValidation,
} from "@/lib/review"
import {
  defaultDraftEntry,
  getDraftStorageKey,
  useReviewDraftStore,
  type ChallengeDraftEntry,
} from "@/stores/review-draft-store"
import type { FlaggedLine } from "@/types/challenge"

export interface UseReviewDraftReturn {
  draft: ReviewDraft
  dispatch: (cmd: ReviewCommand) => CommandOutcome
  validation: ReviewValidation
  isRestored: boolean
  isHydrated: boolean
  // Temporary compatibility properties until Unit 3 migrates UI consumers.
  flaggedLines: FlaggedLine[]
  setFlaggedLines: React.Dispatch<React.SetStateAction<FlaggedLine[]>>
  toggleFlaggedLine: (line: FlaggedLine) => void
  clearFlaggedLines: () => void
  comments: string
  setComments: React.Dispatch<React.SetStateAction<string>>
  comment: string
  setComment: React.Dispatch<React.SetStateAction<string>>
  resetDraft: () => void
}

export function useReviewDraft(
  challengeSlug: string,
  space?: LineSpace
): UseReviewDraftReturn {
  const hydrate = useReviewDraftStore((s) => s.hydrate)
  const storeDispatch = useReviewDraftStore((s) => s.dispatch)
  const entry = useReviewDraftStore(
    (s) => s.drafts[challengeSlug] ?? defaultDraftEntry
  )

  const effectiveSpace = React.useMemo(
    () => space ?? buildUnboundedLineSpace(),
    [space]
  )

  React.useEffect(() => {
    if (challengeSlug) {
      hydrate(challengeSlug)
    }
  }, [challengeSlug, hydrate])

  const dispatch = React.useCallback(
    (cmd: ReviewCommand): CommandOutcome =>
      storeDispatch(challengeSlug, cmd, effectiveSpace),
    [challengeSlug, effectiveSpace, storeDispatch]
  )

  const { draft, hydration } = entry
  const validation = React.useMemo(() => validateReview(draft), [draft])
  const flaggedLines = React.useMemo(() => expandFlaggedLines(draft), [draft])

  const toggleFlaggedLine = React.useCallback(
    (line: FlaggedLine) => {
      dispatch({ type: "toggle", at: toLineRef(line) })
    },
    [dispatch]
  )

  const clearFlaggedLines = React.useCallback(() => {
    for (const finding of draft.findings) {
      dispatch({ type: "removeFinding", id: finding.id })
    }
  }, [dispatch, draft.findings])

  const setFlaggedLines = React.useCallback(
    (action: React.SetStateAction<FlaggedLine[]>) => {
      const next = typeof action === "function" ? action(flaggedLines) : action
      for (const finding of draft.findings) {
        dispatch({ type: "removeFinding", id: finding.id })
      }
      for (const line of next) {
        dispatch({ type: "toggle", at: toLineRef(line) })
      }
    },
    [dispatch, draft.findings, flaggedLines]
  )

  const setComments = React.useCallback(
    (action: React.SetStateAction<string>) => {
      const next =
        typeof action === "function" ? action(draft.summaryNote) : action
      dispatch({ type: "setSummaryNote", note: next })
    },
    [dispatch, draft.summaryNote]
  )

  const resetDraft = React.useCallback(() => {
    dispatch({ type: "reset" })
  }, [dispatch])

  return {
    draft,
    dispatch,
    validation,
    isRestored: hydration === "restored",
    isHydrated: hydration !== "pending",
    flaggedLines,
    setFlaggedLines,
    toggleFlaggedLine,
    clearFlaggedLines,
    comments: draft.summaryNote,
    setComments,
    comment: draft.summaryNote,
    setComment: setComments,
    resetDraft,
  }
}

export { getDraftStorageKey }
export type { ChallengeDraftEntry, ReviewDraft }
