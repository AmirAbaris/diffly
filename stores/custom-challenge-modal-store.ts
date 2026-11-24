import { create } from "zustand"

export interface CustomChallengeModalState {
  isOpen: boolean
  openCustomChallengeModal: () => void
  closeCustomChallengeModal: () => void
  setIsOpen: (isOpen: boolean) => void
}

export const useCustomChallengeModalStore = create<CustomChallengeModalState>(
  (set) => ({
    isOpen: false,

    openCustomChallengeModal: () => {
      set({ isOpen: true })
    },

    closeCustomChallengeModal: () => {
      set({ isOpen: false })
    },

    setIsOpen: (isOpen: boolean) => {
      set({ isOpen })
    },
  })
)
