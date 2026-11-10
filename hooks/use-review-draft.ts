"use client"

import * as React from "react"
import { toast } from "@/hooks/use-toast"
import type { ReviewDraft } from "@/types/challenge"

export function getDraftStorageKey(slug: string): string {
  return `diffly_draft_${slug}`
}

export interface UseReviewDraftReturn {
  flaggedLines: number[]
  setFlaggedLines: React.Dispatch<React.SetStateAction<number[]>>
  toggleFlaggedLine: (line: number) => void
  clearFlaggedLines: () => void
  comments: string
  setComments: React.Dispatch<React.SetStateAction<string>>
  comment: string
  setComment: React.Dispatch<React.SetStateAction<string>>
  resetDraft: () => void
  isRestored: boolean
}

export function useReviewDraft(challengeSlug: string): UseReviewDraftReturn {
  const [flaggedLines, setFlaggedLines] = React.useState<number[]>([])
  const [comments, setComments] = React.useState<string>("")
  const [isRestored, setIsRestored] = React.useState(false)

  const isLoadedRef = React.useRef(false)
  const storageKey = React.useMemo(
    () => (challengeSlug ? getDraftStorageKey(challengeSlug) : ""),
    [challengeSlug]
  )

  // 1. Restore draft on initial mount
  React.useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      isLoadedRef.current = true
      return
    }

    const timer = setTimeout(() => {
      try {
        const savedRaw = window.localStorage.getItem(storageKey)
        if (savedRaw) {
          const parsed = JSON.parse(savedRaw) as Partial<ReviewDraft> & {
            comment?: string
          }

          const restoredLines: number[] = Array.isArray(parsed?.flaggedLines)
            ? parsed.flaggedLines.filter(
                (n): n is number =>
                  typeof n === "number" && Number.isInteger(n) && n > 0
              )
            : []

          const restoredComments: string =
            typeof parsed?.comments === "string"
              ? parsed.comments
              : typeof parsed?.comment === "string"
                ? parsed.comment
                : ""

          const hasContent =
            restoredLines.length > 0 || restoredComments.trim().length > 0

          if (hasContent) {
            setFlaggedLines(restoredLines)
            setComments(restoredComments)
            setIsRestored(true)

            const linesCount = restoredLines.length
            const lineSummary =
              linesCount === 1
                ? "1 line flagged"
                : `${linesCount} lines flagged`
            const charsCount = restoredComments.length
            const charSummary = `${charsCount} ${charsCount === 1 ? "char" : "chars"}`

            toast({
              title: "Draft restored",
              description: `Restored saved draft (${lineSummary} • ${charSummary}).`,
            })
          }
        }
      } catch {
        // Fallback gracefully on storage corruption
      } finally {
        isLoadedRef.current = true
      }
    }, 0)

    return () => clearTimeout(timer)
  }, [storageKey])

  // 2. Autosave changes to localStorage
  React.useEffect(() => {
    if (!isLoadedRef.current || !storageKey || typeof window === "undefined") {
      return
    }

    try {
      const draftPayload: ReviewDraft = {
        flaggedLines,
        comments,
        updatedAt: new Date().toISOString(),
      }
      window.localStorage.setItem(storageKey, JSON.stringify(draftPayload))
    } catch {
      // Fallback gracefully if storage is restricted or quota exceeded
    }
  }, [storageKey, flaggedLines, comments])

  const toggleFlaggedLine = React.useCallback((line: number) => {
    setFlaggedLines((prev) =>
      prev.includes(line) ? prev.filter((l) => l !== line) : [...prev, line]
    )
  }, [])

  const clearFlaggedLines = React.useCallback(() => {
    setFlaggedLines([])
  }, [])

  const resetDraft = React.useCallback(() => {
    setFlaggedLines([])
    setComments("")
    setIsRestored(false)
    if (storageKey && typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(storageKey)
      } catch {
        // Fallback gracefully
      }
    }
  }, [storageKey])

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
