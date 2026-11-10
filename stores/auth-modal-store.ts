import { create } from "zustand"

export type AuthTab = "signin" | "signup"

export interface AuthModalState {
  isOpen: boolean
  initialTab: AuthTab
  openAuthModal: (tab?: AuthTab) => void
  closeAuthModal: () => void
  setIsOpen: (isOpen: boolean) => void
  setInitialTab: (tab: AuthTab) => void
}

export const useAuthModalStore = create<AuthModalState>((set) => ({
  isOpen: false,
  initialTab: "signin",

  openAuthModal: (tab: AuthTab = "signin") => {
    set({
      isOpen: true,
      initialTab: tab,
    })
  },

  closeAuthModal: () => {
    set({
      isOpen: false,
    })
  },

  setIsOpen: (isOpen: boolean) => {
    set({ isOpen })
  },

  setInitialTab: (initialTab: AuthTab) => {
    set({ initialTab })
  },
}))
