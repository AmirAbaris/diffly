import { create } from "zustand"

export type CustomChallengeTab = "generate" | "manage"

export interface CustomChallengeModalState {
  isOpen: boolean
  initialTab: CustomChallengeTab
  openCustomChallengeModal: (tab?: CustomChallengeTab) => void
  closeCustomChallengeModal: () => void
  setIsOpen: (isOpen: boolean) => void
  setInitialTab: (tab: CustomChallengeTab) => void
}

export const useCustomChallengeModalStore = create<CustomChallengeModalState>(
  (set) => ({
    isOpen: false,
    initialTab: "generate",

    openCustomChallengeModal: (tab: CustomChallengeTab = "generate") => {
      set({
        isOpen: true,
        initialTab: tab,
      })
    },

    closeCustomChallengeModal: () => {
      set({
        isOpen: false,
      })
    },

    setIsOpen: (isOpen: boolean) => {
      set({ isOpen })
    },

    setInitialTab: (initialTab: CustomChallengeTab) => {
      set({ initialTab })
    },
  })
)
