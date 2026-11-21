"use client"

import * as React from "react"
import {
  compareFileKeys,
  isSameLineRef,
  lineRefKey,
  type Finding,
  type LineRef,
  type LineSpace,
} from "@/lib/review"

export interface CursorState {
  readonly cursor: LineRef | null
  readonly selectionAnchor: LineRef | null
}

function focusLineElement(ref: LineRef | null) {
  if (!ref || typeof document === "undefined") return
  const key = lineRefKey(ref)
  const el = document.querySelector<HTMLElement>(
    `[data-line-key="${CSS.escape(key)}"]`
  )
  el?.focus({ preventScroll: false })
}

export function useLineCursor(
  lineSpace: LineSpace,
  onSelectFile?: (filePath: string) => void
) {
  const [state, setState] = React.useState<CursorState>({
    cursor: null,
    selectionAnchor: null,
  })
  const stateRef = React.useRef(state)
  React.useEffect(() => {
    stateRef.current = state
  }, [state])

  const focusAndSyncFile = React.useCallback(
    (target: LineRef) => {
      if (target.file && onSelectFile) {
        onSelectFile(target.file)
      }
      requestAnimationFrame(() => {
        focusLineElement(target)
      })
    },
    [onSelectFile]
  )

  const setCursor = React.useCallback(
    (cursor: LineRef | null, selectionAnchor?: LineRef | null) => {
      setState((prev) => ({
        cursor,
        selectionAnchor:
          selectionAnchor !== undefined
            ? selectionAnchor
            : prev.selectionAnchor,
      }))
    },
    []
  )

  const clearSelectionAnchor = React.useCallback(() => {
    setState((prev) =>
      prev.selectionAnchor === null ? prev : { ...prev, selectionAnchor: null }
    )
  }, [])

  const firstFlaggableLine = React.useCallback((): LineRef | null => {
    for (const file of lineSpace.files) {
      const candidate = lineSpace.next({ file, line: 0 })
      if (candidate) return candidate
    }
    return null
  }, [lineSpace])

  const move = React.useCallback(
    (direction: "down" | "up"): LineRef | null => {
      const current = stateRef.current.cursor
      const target = current
        ? direction === "down"
          ? lineSpace.next(current)
          : lineSpace.prev(current)
        : firstFlaggableLine()

      if (!target) return null
      setState({ cursor: target, selectionAnchor: null })
      focusAndSyncFile(target)
      return target
    },
    [firstFlaggableLine, focusAndSyncFile, lineSpace]
  )

  const extend = React.useCallback(
    (
      direction: "down" | "up",
      onExtendRange: (from: LineRef, to: LineRef) => void
    ): LineRef | null => {
      const current = stateRef.current.cursor ?? firstFlaggableLine()
      if (!current) return null
      const anchor = stateRef.current.selectionAnchor ?? current
      const target =
        direction === "down" ? lineSpace.next(current) : lineSpace.prev(current)
      const nextCursor = target ?? current

      setState({ cursor: nextCursor, selectionAnchor: anchor })
      onExtendRange(anchor, nextCursor)
      focusAndSyncFile(nextCursor)
      return nextCursor
    },
    [firstFlaggableLine, focusAndSyncFile, lineSpace]
  )

  const jumpFinding = React.useCallback(
    (
      findings: readonly Finding[],
      direction: "next" | "prev"
    ): Finding | null => {
      if (findings.length === 0) return null
      const current = stateRef.current.cursor

      if (!current) {
        const chosen =
          direction === "next" ? findings[0] : findings[findings.length - 1]
        const target: LineRef = {
          file: chosen.anchor.file,
          line: chosen.anchor.start,
        }
        setState({ cursor: target, selectionAnchor: null })
        focusAndSyncFile(target)
        return chosen
      }

      if (direction === "next") {
        const next =
          findings.find((f) => {
            const fileCmp = compareFileKeys(f.anchor.file, current.file)
            if (fileCmp > 0) return true
            if (fileCmp < 0) return false
            return f.anchor.start > current.line
          }) ?? findings[0]

        const target: LineRef = {
          file: next.anchor.file,
          line: next.anchor.start,
        }
        setState({ cursor: target, selectionAnchor: null })
        focusAndSyncFile(target)
        return next
      }

      const reversed = [...findings].reverse()
      const prev =
        reversed.find((f) => {
          const fileCmp = compareFileKeys(f.anchor.file, current.file)
          if (fileCmp < 0) return true
          if (fileCmp > 0) return false
          return (
            f.anchor.start < current.line &&
            !isSameLineRef(current, {
              file: f.anchor.file,
              line: f.anchor.start,
            })
          )
        }) ?? findings[findings.length - 1]

      const target: LineRef = {
        file: prev.anchor.file,
        line: prev.anchor.start,
      }
      setState({ cursor: target, selectionAnchor: null })
      focusAndSyncFile(target)
      return prev
    },
    [focusAndSyncFile]
  )

  return {
    cursor: state.cursor,
    selectionAnchor: state.selectionAnchor,
    setCursor,
    clearSelectionAnchor,
    move,
    extend,
    jumpFinding,
    firstFlaggableLine,
  }
}
