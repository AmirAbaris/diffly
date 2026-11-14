import { create } from "zustand"
import type { ReviewSubmissionResponse } from "@/types/challenge"

export type ArenaMobileTab = "brief" | "code"

export interface SubmittedReviewPayload {
  flaggedLines: number[]
  comments: string
}

export interface ArenaUIState {
  mobileTab: ArenaMobileTab
  isSubmitting: boolean
  submissionResult: ReviewSubmissionResponse | null
  isResultModalOpen: boolean
  isHistoryOpen: boolean
  isFlagGuideOpen: boolean
  submittedReview: SubmittedReviewPayload | null

  setMobileTab: (tab: ArenaMobileTab) => void
  setIsSubmitting: (isSubmitting: boolean) => void
  setSubmissionResult: (result: ReviewSubmissionResponse | null) => void
  setIsResultModalOpen: (open: boolean) => void
  setIsHistoryOpen: (open: boolean) => void
  setIsFlagGuideOpen: (open: boolean) => void
  setSubmittedReview: (
    action:
      | SubmittedReviewPayload
      | null
      | ((prev: SubmittedReviewPayload | null) => SubmittedReviewPayload | null)
  ) => void
  resetArenaUI: () => void
}

export const useArenaUIStore = create<ArenaUIState>((set) => ({
  mobileTab: "brief",
  isSubmitting: false,
  submissionResult: null,
  isResultModalOpen: false,
  isHistoryOpen: false,
  isFlagGuideOpen: false,
  submittedReview: null,

  setMobileTab: (mobileTab) => set({ mobileTab }),
  setIsSubmitting: (isSubmitting) => set({ isSubmitting }),
  setSubmissionResult: (submissionResult) => set({ submissionResult }),
  setIsResultModalOpen: (isResultModalOpen) => set({ isResultModalOpen }),
  setIsHistoryOpen: (isHistoryOpen) => set({ isHistoryOpen }),
  setIsFlagGuideOpen: (isFlagGuideOpen) => set({ isFlagGuideOpen }),
  setSubmittedReview: (action) =>
    set((state) => ({
      submittedReview:
        typeof action === "function" ? action(state.submittedReview) : action,
    })),
  resetArenaUI: () =>
    set({
      mobileTab: "brief",
      isSubmitting: false,
      submissionResult: null,
      isResultModalOpen: false,
      isHistoryOpen: false,
      isFlagGuideOpen: false,
      submittedReview: null,
    }),
}))
