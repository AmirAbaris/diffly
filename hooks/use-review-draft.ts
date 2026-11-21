"use client"

import * as React from "react"
import {
  useReviewDraftStore,
  getDraftStorageKey,
  defaultDraftState,
  type ChallengeDraftState,
} from "@/stores/review-draft-store"
import type { FlaggedLine, ReviewDraft } from "@/types/challenge"

export interface UseReviewDraftReturn {
  flaggedLines: FlaggedLine[]
  setFlaggedLines: React.Dispatch<React.SetStateAction<FlaggedLine[]>>
  toggleFlaggedLine: (line: FlaggedLine) => void
  clearFlaggedLines: () => void
  comments: string
  setComments: React.Dispatch<React.SetStateAction<string>>
  comment: string
  setComment: React.Dispatch<React.SetStateAction<string>>
  resetDraft: () => void
  isRestored: boolean
}

export function useReviewDraft(challengeSlug: string): UseReviewDraftReturn {
  const initDraft = useReviewDraftStore((s) => s.initDraft)
  const draft = useReviewDraftStore(
    (s) => s.drafts[challengeSlug] ?? defaultDraftState
  )
  const setStoreFlaggedLines = useReviewDraftStore((s) => s.setFlaggedLines)
  const toggleStoreFlaggedLine = useReviewDraftStore((s) => s.toggleFlaggedLine)
  const clearStoreFlaggedLines = useReviewDraftStore((s) => s.clearFlaggedLines)
  const setStoreComments = useReviewDraftStore((s) => s.setComments)
  const resetStoreDraft = useReviewDraftStore((s) => s.resetDraft)

  // Initialize and hydrate draft on mount or slug change
  React.useEffect(() => {
    if (challengeSlug) {
      initDraft(challengeSlug)
    }
  }, [challengeSlug, initDraft])

  const flaggedLines = draft.flaggedLines
  const comments = draft.comments
  const isRestored = draft.isRestored

  const setFlaggedLines = React.useCallback(
    (action: React.SetStateAction<FlaggedLine[]>) => {
      setStoreFlaggedLines(challengeSlug, action)
    },
    [challengeSlug, setStoreFlaggedLines]
  )

  const toggleFlaggedLine = React.useCallback(
    (line: FlaggedLine) => {
      toggleStoreFlaggedLine(challengeSlug, line)
    },
    [challengeSlug, toggleStoreFlaggedLine]
  )

  const clearFlaggedLines = React.useCallback(() => {
    clearStoreFlaggedLines(challengeSlug)
  }, [challengeSlug, clearStoreFlaggedLines])

  const setComments = React.useCallback(
    (action: React.SetStateAction<string>) => {
      setStoreComments(challengeSlug, action)
    },
    [challengeSlug, setStoreComments]
  )

  const resetDraft = React.useCallback(() => {
    resetStoreDraft(challengeSlug)
  }, [challengeSlug, resetStoreDraft])

  return {
    flaggedLines,
    setFlaggedLines,
    toggleFlaggedLine,
    clearFlaggedLines,
    comments,
    setComments,
    comment: comments,
    setComment: setComments,
    resetDraft,
    isRestored,
  }
}

export { getDraftStorageKey }
export type { ReviewDraft, ChallengeDraftState }
