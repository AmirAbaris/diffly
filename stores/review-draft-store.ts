import { create } from "zustand"
import { toast } from "@/stores/toast-store"
import type { ReviewDraft } from "@/types/challenge"

export function getDraftStorageKey(slug: string): string {
  return `diffly_draft_${slug}`
}

export interface ChallengeDraftState {
  flaggedLines: number[]
  comments: string
  isRestored: boolean
  isHydrated: boolean
}

export const defaultDraftState: ChallengeDraftState = {
  flaggedLines: [],
  comments: "",
  isRestored: false,
  isHydrated: false,
}

export interface ReviewDraftStore {
  drafts: Record<string, ChallengeDraftState>
  initDraft: (slug: string) => void
  setFlaggedLines: (
    slug: string,
    action: number[] | ((prev: number[]) => number[])
  ) => void
  toggleFlaggedLine: (slug: string, line: number) => void
  clearFlaggedLines: (slug: string) => void
  setComments: (
    slug: string,
    action: string | ((prev: string) => string)
  ) => void
  resetDraft: (slug: string) => void
}

function persistToStorage(
  slug: string,
  flaggedLines: number[],
  comments: string
) {
  if (typeof window === "undefined" || !slug) return
  try {
    const key = getDraftStorageKey(slug)
    const payload: ReviewDraft = {
      flaggedLines,
      comments,
      updatedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(key, JSON.stringify(payload))
  } catch {
    // Graceful fallback for restricted environments
  }
}

function removeFromStorage(slug: string) {
  if (typeof window === "undefined" || !slug) return
  try {
    const key = getDraftStorageKey(slug)
    window.localStorage.removeItem(key)
  } catch {
    // Graceful fallback
  }
}

export const useReviewDraftStore = create<ReviewDraftStore>((set, get) => ({
  drafts: {},

  initDraft: (slug: string) => {
    if (!slug) return
    const current = get().drafts[slug]
    if (current?.isHydrated) return

    let restoredLines: number[] = []
    let restoredComments = ""
    let hasContent = false

    if (typeof window !== "undefined") {
      try {
        const key = getDraftStorageKey(slug)
        const savedRaw = window.localStorage.getItem(key)
        if (savedRaw) {
          const parsed = JSON.parse(savedRaw) as Partial<ReviewDraft> & {
            comment?: string
          }

          restoredLines = Array.isArray(parsed?.flaggedLines)
            ? parsed.flaggedLines.filter(
                (n): n is number =>
                  typeof n === "number" && Number.isInteger(n) && n > 0
              )
            : []

          restoredComments =
            typeof parsed?.comments === "string"
              ? parsed.comments
              : typeof parsed?.comment === "string"
                ? parsed.comment
                : ""

          hasContent =
            restoredLines.length > 0 || restoredComments.trim().length > 0
        }
      } catch {
        // Fallback gracefully on storage corruption
      }
    }

    set((state) => ({
      drafts: {
        ...state.drafts,
        [slug]: {
          flaggedLines: restoredLines,
          comments: restoredComments,
          isRestored: hasContent,
          isHydrated: true,
        },
      },
    }))

    if (hasContent) {
      const linesCount = restoredLines.length
      const lineSummary =
        linesCount === 1 ? "1 line flagged" : `${linesCount} lines flagged`
      const charsCount = restoredComments.length
      const charSummary = `${charsCount} ${charsCount === 1 ? "char" : "chars"}`

      toast({
        title: "Draft restored",
        description: `Restored saved draft (${lineSummary} • ${charSummary}).`,
      })
    }
  },

  setFlaggedLines: (slug, action) => {
    if (!slug) return
    const current = get().drafts[slug] ?? defaultDraftState
    const newLines =
      typeof action === "function" ? action(current.flaggedLines) : action

    set((state) => ({
      drafts: {
        ...state.drafts,
        [slug]: {
          ...(state.drafts[slug] ?? defaultDraftState),
          flaggedLines: newLines,
          isHydrated: true,
        },
      },
    }))

    persistToStorage(slug, newLines, current.comments)
  },

  toggleFlaggedLine: (slug, line) => {
    if (!slug) return
    const current = get().drafts[slug] ?? defaultDraftState
    const prev = current.flaggedLines
    const newLines = prev.includes(line)
      ? prev.filter((l) => l !== line)
      : [...prev, line]

    set((state) => ({
      drafts: {
        ...state.drafts,
        [slug]: {
          ...(state.drafts[slug] ?? defaultDraftState),
          flaggedLines: newLines,
          isHydrated: true,
        },
      },
    }))

    persistToStorage(slug, newLines, current.comments)
  },

  clearFlaggedLines: (slug) => {
    if (!slug) return
    const current = get().drafts[slug] ?? defaultDraftState

    set((state) => ({
      drafts: {
        ...state.drafts,
        [slug]: {
          ...(state.drafts[slug] ?? defaultDraftState),
          flaggedLines: [],
          isHydrated: true,
        },
      },
    }))

    persistToStorage(slug, [], current.comments)
  },

  setComments: (slug, action) => {
    if (!slug) return
    const current = get().drafts[slug] ?? defaultDraftState
    const newComments =
      typeof action === "function" ? action(current.comments) : action

    set((state) => ({
      drafts: {
        ...state.drafts,
        [slug]: {
          ...(state.drafts[slug] ?? defaultDraftState),
          comments: newComments,
          isHydrated: true,
        },
      },
    }))

    persistToStorage(slug, current.flaggedLines, newComments)
  },

  resetDraft: (slug) => {
    if (!slug) return

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

    removeFromStorage(slug)
  },
}))
