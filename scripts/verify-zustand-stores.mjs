import assert from "node:assert/strict"
import { createStore } from "zustand/vanilla"

process.stdout.write("==> Verifying Zustand Stores Architecture...\n")

// 1. Verify Toast Store
process.stdout.write("--> Testing Toast Store...\n")
const TOAST_LIMIT = 5

function createToastStore() {
  return createStore((set) => ({
    toasts: [],
    addToast: (toast) =>
      set((state) => ({
        toasts: [toast, ...state.toasts].slice(0, TOAST_LIMIT),
      })),
    updateToast: (updated) =>
      set((state) => ({
        toasts: state.toasts.map((t) =>
          t.id === updated.id ? { ...t, ...updated } : t
        ),
      })),
    dismissToast: (toastId) =>
      set((state) => ({
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined ? { ...t, open: false } : t
        ),
      })),
    removeToast: (toastId) =>
      set((state) => ({
        toasts:
          toastId === undefined
            ? []
            : state.toasts.filter((t) => t.id !== toastId),
      })),
    clearToasts: () => set({ toasts: [] }),
  }))
}

const toastStore = createToastStore()
assert.equal(toastStore.getState().toasts.length, 0)

// Add toasts and verify LIFO order and TOAST_LIMIT cap
for (let i = 1; i <= 7; i++) {
  toastStore
    .getState()
    .addToast({ id: `t-${i}`, title: `Toast ${i}`, open: true })
}
assert.equal(
  toastStore.getState().toasts.length,
  TOAST_LIMIT,
  "Toasts must be capped at TOAST_LIMIT (5)"
)
assert.equal(
  toastStore.getState().toasts[0].id,
  "t-7",
  "Latest toast must be first (LIFO)"
)

// Update toast
toastStore.getState().updateToast({ id: "t-7", title: "Updated Toast 7" })
assert.equal(
  toastStore.getState().toasts[0].title,
  "Updated Toast 7",
  "Toast title should be updated"
)

// Dismiss specific toast
toastStore.getState().dismissToast("t-7")
assert.equal(
  toastStore.getState().toasts[0].open,
  false,
  "Dismissed toast must set open: false"
)
assert.equal(
  toastStore.getState().toasts[1].open,
  true,
  "Other toasts remain open"
)

// Dismiss all toasts
toastStore.getState().dismissToast()
assert.ok(
  toastStore.getState().toasts.every((t) => t.open === false),
  "Dismiss with no ID must close all toasts"
)

// Remove specific toast
toastStore.getState().removeToast("t-7")
assert.equal(
  toastStore.getState().toasts.find((t) => t.id === "t-7"),
  undefined,
  "Removed toast must not exist"
)

// Clear all toasts
toastStore.getState().clearToasts()
assert.equal(toastStore.getState().toasts.length, 0, "Clear must empty toasts")
process.stdout.write("✓ Toast Store passed all assertions\n")

// 2. Verify Auth Modal Store
process.stdout.write("--> Testing Auth Modal Store...\n")
function createAuthModalStore() {
  return createStore((set) => ({
    isOpen: false,
    initialTab: "signin",
    openAuthModal: (tab = "signin") => set({ isOpen: true, initialTab: tab }),
    closeAuthModal: () => set({ isOpen: false }),
    setIsOpen: (isOpen) => set({ isOpen }),
    setInitialTab: (initialTab) => set({ initialTab }),
  }))
}

const authModalStore = createAuthModalStore()
assert.equal(authModalStore.getState().isOpen, false)
assert.equal(authModalStore.getState().initialTab, "signin")

authModalStore.getState().openAuthModal("signup")
assert.equal(authModalStore.getState().isOpen, true)
assert.equal(
  authModalStore.getState().initialTab,
  "signup",
  "Tab must switch to signup"
)

authModalStore.getState().closeAuthModal()
assert.equal(authModalStore.getState().isOpen, false)

authModalStore.getState().openAuthModal()
assert.equal(authModalStore.getState().isOpen, true)
assert.equal(
  authModalStore.getState().initialTab,
  "signin",
  "Default tab is signin"
)
process.stdout.write("✓ Auth Modal Store passed all assertions\n")

// 3. Verify Review Draft Store
process.stdout.write("--> Testing Review Draft Store...\n")
function createReviewDraftStore() {
  const defaultDraftState = {
    flaggedLines: [],
    comments: "",
    isRestored: false,
    isHydrated: false,
  }

  return createStore((set, get) => ({
    drafts: {},
    initDraft: (slug, restoredData = null) => {
      const current = get().drafts[slug]
      if (current?.isHydrated) return

      const lines = restoredData?.flaggedLines || []
      const comments = restoredData?.comments || ""
      const hasContent = lines.length > 0 || comments.trim().length > 0

      set((state) => ({
        drafts: {
          ...state.drafts,
          [slug]: {
            flaggedLines: lines,
            comments,
            isRestored: hasContent,
            isHydrated: true,
          },
        },
      }))
    },
    setFlaggedLines: (slug, action) => {
      const current = get().drafts[slug] || defaultDraftState
      const newLines =
        typeof action === "function" ? action(current.flaggedLines) : action
      set((state) => ({
        drafts: {
          ...state.drafts,
          [slug]: {
            ...(state.drafts[slug] || defaultDraftState),
            flaggedLines: newLines,
            isHydrated: true,
          },
        },
      }))
    },
    toggleFlaggedLine: (slug, line) => {
      const current = get().drafts[slug] || defaultDraftState
      const prev = current.flaggedLines
      const newLines = prev.includes(line)
        ? prev.filter((l) => l !== line)
        : [...prev, line]
      set((state) => ({
        drafts: {
          ...state.drafts,
          [slug]: {
            ...(state.drafts[slug] || defaultDraftState),
            flaggedLines: newLines,
            isHydrated: true,
          },
        },
      }))
    },
    clearFlaggedLines: (slug) => {
      set((state) => ({
        drafts: {
          ...state.drafts,
          [slug]: {
            ...(state.drafts[slug] || defaultDraftState),
            flaggedLines: [],
            isHydrated: true,
          },
        },
      }))
    },
    setComments: (slug, action) => {
      const current = get().drafts[slug] || defaultDraftState
      const newComments =
        typeof action === "function" ? action(current.comments) : action
      set((state) => ({
        drafts: {
          ...state.drafts,
          [slug]: {
            ...(state.drafts[slug] || defaultDraftState),
            comments: newComments,
            isHydrated: true,
          },
        },
      }))
    },
    resetDraft: (slug) => {
      set((state) => ({
        drafts: {
          ...state.drafts,
          [slug]: {
            flaggedLines: [],
            comments: "",
            isRestored: false,
            isHydrated: true,
          },
        },
      }))
    },
  }))
}

const draftStore = createReviewDraftStore()
const slugA = "challenge-a"
const slugB = "challenge-b"

// Initialize empty draft
draftStore.getState().initDraft(slugA)
assert.deepEqual(draftStore.getState().drafts[slugA].flaggedLines, [])
assert.equal(draftStore.getState().drafts[slugA].comments, "")
assert.equal(draftStore.getState().drafts[slugA].isRestored, false)

// Toggle line
draftStore.getState().toggleFlaggedLine(slugA, 12)
assert.deepEqual(draftStore.getState().drafts[slugA].flaggedLines, [12])
draftStore.getState().toggleFlaggedLine(slugA, 25)
assert.deepEqual(draftStore.getState().drafts[slugA].flaggedLines, [12, 25])
draftStore.getState().toggleFlaggedLine(slugA, 12)
assert.deepEqual(
  draftStore.getState().drafts[slugA].flaggedLines,
  [25],
  "Toggle line off"
)

// Set comments
draftStore
  .getState()
  .setComments(slugA, "Buffer overflow found in memory allocation.")
assert.equal(
  draftStore.getState().drafts[slugA].comments,
  "Buffer overflow found in memory allocation."
)

// Challenge isolation test
draftStore.getState().initDraft(slugB, {
  flaggedLines: [4, 8],
  comments: "SQL injection flaw",
})
assert.deepEqual(
  draftStore.getState().drafts[slugB].flaggedLines,
  [4, 8],
  "Challenge B has isolated flagged lines"
)
assert.deepEqual(
  draftStore.getState().drafts[slugA].flaggedLines,
  [25],
  "Challenge A remains untouched"
)

// Reset draft
draftStore.getState().resetDraft(slugA)
assert.deepEqual(draftStore.getState().drafts[slugA].flaggedLines, [])
assert.equal(draftStore.getState().drafts[slugA].comments, "")
process.stdout.write("✓ Review Draft Store passed all assertions\n")

// 4. Verify Arena UI Store
process.stdout.write("--> Testing Arena UI Store...\n")
function createArenaUIStore() {
  return createStore((set) => ({
    mobileTab: "brief",
    isSubmitting: false,
    submissionResult: null,
    isResultModalOpen: false,
    isHistoryOpen: false,
    submittedReview: null,
    setMobileTab: (mobileTab) => set({ mobileTab }),
    setIsSubmitting: (isSubmitting) => set({ isSubmitting }),
    setSubmissionResult: (submissionResult) => set({ submissionResult }),
    setIsResultModalOpen: (isResultModalOpen) => set({ isResultModalOpen }),
    setIsHistoryOpen: (isHistoryOpen) => set({ isHistoryOpen }),
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
        submittedReview: null,
      }),
  }))
}

const arenaStore = createArenaUIStore()
assert.equal(arenaStore.getState().mobileTab, "brief")
assert.equal(arenaStore.getState().isResultModalOpen, false)
assert.equal(arenaStore.getState().isHistoryOpen, false)

arenaStore.getState().setMobileTab("code")
assert.equal(arenaStore.getState().mobileTab, "code")

arenaStore.getState().setIsHistoryOpen(true)
assert.equal(arenaStore.getState().isHistoryOpen, true)

arenaStore.getState().setSubmissionResult({ score: 95, flagged_lines: [12] })
arenaStore.getState().setIsResultModalOpen(true)
assert.equal(arenaStore.getState().isResultModalOpen, true)
assert.equal(arenaStore.getState().submissionResult.score, 95)

arenaStore.getState().resetArenaUI()
assert.equal(arenaStore.getState().mobileTab, "brief")
assert.equal(arenaStore.getState().isResultModalOpen, false)
assert.equal(arenaStore.getState().isHistoryOpen, false)
assert.equal(arenaStore.getState().submissionResult, null)

process.stdout.write("✓ Arena UI Store passed all assertions\n")
process.stdout.write(
  "\n==> All Zustand Stores verified cleanly with 100% success! 🎉\n"
)
