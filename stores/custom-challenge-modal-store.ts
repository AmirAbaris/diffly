import { create } from "zustand"

import type { Difficulty, Language } from "@/types/challenge"

export type CustomChallengeTab = "generate" | "manage"

export interface CustomChallengePrefill {
  topic: string
  language: Language
  difficulty: Difficulty
}

export interface CustomChallengeModalState {
  isOpen: boolean
  initialTab: CustomChallengeTab
  prefill: CustomChallengePrefill | null
  prefillNonce: number
  openCustomChallengeModal: (
    tab?: CustomChallengeTab,
    prefill?: CustomChallengePrefill | null
  ) => void
  closeCustomChallengeModal: () => void
  setIsOpen: (isOpen: boolean) => void
  setInitialTab: (tab: CustomChallengeTab) => void
}

export const useCustomChallengeModalStore = create<CustomChallengeModalState>(
  (set) => ({
    isOpen: false,
    initialTab: "generate",
    prefill: null,
    prefillNonce: 0,

    openCustomChallengeModal: (
      tab: CustomChallengeTab = "generate",
      prefill: CustomChallengePrefill | null = null
    ) => {
      set((state) => ({
        isOpen: true,
        initialTab: tab,
        prefill,
        prefillNonce: prefill ? state.prefillNonce + 1 : state.prefillNonce,
      }))
    },

    closeCustomChallengeModal: () => {
      set({
        isOpen: false,
        prefill: null,
      })
    },

    setIsOpen: (isOpen: boolean) => {
      set(isOpen ? { isOpen: true } : { isOpen: false, prefill: null })
    },

    setInitialTab: (initialTab: CustomChallengeTab) => {
      set({ initialTab })
    },
  })
)
