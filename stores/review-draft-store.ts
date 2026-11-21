import * as React from "react"
import { create } from "zustand"
import {
  applyCommand,
  emptyDraft,
  formatAnchor,
  parseStoredDraft,
  serializeStoredDraft,
  type CommandOutcome,
  type LineSpace,
  type ReviewCommand,
  type ReviewDraft,
} from "@/lib/review"
import { toast } from "@/stores/toast-store"

export function getDraftStorageKey(slug: string): string {
  return `diffly_draft_${slug}`
}

export type DraftHydrationState = "pending" | "fresh" | "restored"

export interface ChallengeDraftEntry {
  readonly draft: ReviewDraft
  readonly hydration: DraftHydrationState
}

export const defaultDraftEntry: ChallengeDraftEntry = {
  draft: emptyDraft(),
  hydration: "pending",
}

export interface ReviewDraftStore {
  drafts: Record<string, ChallengeDraftEntry>
  hydrate: (slug: string) => void
  dispatch: (
    slug: string,
    cmd: ReviewCommand,
    space: LineSpace
  ) => CommandOutcome
}

function persistToStorage(slug: string, serialized: string) {
  if (typeof window === "undefined" || !slug) return
  try {
    window.localStorage.setItem(getDraftStorageKey(slug), serialized)
  } catch {
    // Graceful fallback for restricted environments
  }
}

function removeFromStorage(slug: string) {
  if (typeof window === "undefined" || !slug) return
  try {
    window.localStorage.removeItem(getDraftStorageKey(slug))
  } catch {
    // Graceful fallback
  }
}

export const useReviewDraftStore = create<ReviewDraftStore>((set, get) => ({
  drafts: {},

  hydrate: (slug) => {
    if (!slug) return
    const current = get().drafts[slug]
    if (current && current.hydration !== "pending") return

    let restored = emptyDraft()

    if (typeof window !== "undefined") {
      try {
        const savedRaw = window.localStorage.getItem(getDraftStorageKey(slug))
        if (savedRaw) {
          restored = parseStoredDraft(JSON.parse(savedRaw))
        }
      } catch {
        restored = emptyDraft()
      }
    }

    const hasContent =
      restored.findings.length > 0 || restored.summaryNote.trim().length > 0

    set((state) => ({
      drafts: {
        ...state.drafts,
        [slug]: {
          draft: restored,
          hydration: hasContent ? "restored" : "fresh",
        },
      },
    }))

    if (hasContent) {
      const findingCount = restored.findings.length
      const findingSummary =
        findingCount === 1 ? "1 finding" : `${findingCount} findings`
      const charsCount = restored.summaryNote.length
      const charSummary = `${charsCount} ${charsCount === 1 ? "char" : "chars"}`

      toast({
        title: "Draft restored",
        description: `Restored saved draft (${findingSummary} • ${charSummary}).`,
      })
    }
  },

  dispatch: (slug, cmd, space) => {
    if (!slug) {
      return { draft: emptyDraft(), removed: null, focus: null }
    }

    const current = get().drafts[slug] ?? defaultDraftEntry
    const outcome = applyCommand(current.draft, cmd, space)
    const nextHydration: DraftHydrationState =
      cmd.type === "reset"
        ? "fresh"
        : current.hydration === "pending"
          ? "fresh"
          : current.hydration

    set((state) => ({
      drafts: {
        ...state.drafts,
        [slug]: {
          draft: outcome.draft,
          hydration: nextHydration,
        },
      },
    }))

    const isEmpty =
      outcome.draft.findings.length === 0 &&
      outcome.draft.summaryNote.length === 0
    if (cmd.type === "reset" || isEmpty) {
      removeFromStorage(slug)
    } else {
      persistToStorage(slug, serializeStoredDraft(outcome.draft))
    }

    if (outcome.removed && outcome.removed.body.trim().length > 0) {
      const removedFinding = outcome.removed
      const handle = toast({
        title: "Finding removed",
        description: `Removed finding on ${formatAnchor(removedFinding.anchor)}.`,
        action: React.createElement(
          "button",
          {
            type: "button",
            className:
              "inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-border bg-transparent px-2.5 text-xs font-medium transition-colors hover:bg-muted",
            onClick: () => {
              get().dispatch(
                slug,
                { type: "restoreFinding", finding: removedFinding },
                space
              )
              handle.dismiss()
            },
          },
          "Undo"
        ),
      })
    }

    return outcome
  },
}))
