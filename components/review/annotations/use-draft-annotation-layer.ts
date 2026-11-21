"use client"

import * as React from "react"
import {
  findingAt,
  isSameLineRef,
  type CommandOutcome,
  type Finding,
  type FindingId,
  type LineRef,
  type LineSpace,
  type ReviewCommand,
  type ReviewDraft,
} from "@/lib/review"
import {
  type AnnotationActivateMods,
  type AnnotationLayer,
  type RangeEdge,
  type RowAnnotation,
  type ThreadSlot,
} from "./annotation-layer"
import { useLineCursor } from "./use-line-cursor"

export interface UseDraftAnnotationLayerOptions {
  draft: ReviewDraft
  dispatch: (cmd: ReviewCommand) => CommandOutcome
  lineSpace: LineSpace
  onSelectFile?: (filePath: string) => void
}

function computeRangeEdge(line: number, start: number, end: number): RangeEdge {
  if (start === end) return "single"
  if (line === start) return "start"
  if (line === end) return "end"
  return "middle"
}

export function useDraftAnnotationLayer({
  draft,
  dispatch,
  lineSpace,
  onSelectFile,
}: UseDraftAnnotationLayerOptions) {
  const [editingFindingId, setEditingFindingId] =
    React.useState<FindingId | null>(null)
  const cursorApi = useLineCursor(lineSpace, onSelectFile)
  const listenersRef = React.useRef(new Set<() => void>())

  const latestRef = React.useRef({
    draft,
    cursor: cursorApi.cursor,
    selectionAnchor: cursorApi.selectionAnchor,
    editingFindingId,
  })

  React.useEffect(() => {
    latestRef.current = {
      draft,
      cursor: cursorApi.cursor,
      selectionAnchor: cursorApi.selectionAnchor,
      editingFindingId,
    }
    for (const listener of listenersRef.current) {
      listener()
    }
  }, [draft, cursorApi.cursor, cursorApi.selectionAnchor, editingFindingId])

  const activate = React.useCallback(
    (at: LineRef, mods?: AnnotationActivateMods) => {
      if (!lineSpace.isFlaggable(at)) return

      const prevAnchor =
        latestRef.current.selectionAnchor ?? latestRef.current.cursor

      if (mods?.shiftKey && prevAnchor) {
        const outcome = dispatch({
          type: "flagRange",
          from: prevAnchor,
          to: at,
        })
        cursorApi.setCursor(at, prevAnchor)
        if (outcome.focus) {
          setEditingFindingId(outcome.focus)
        }
        return
      }

      const outcome = dispatch({ type: "toggle", at })
      if (outcome.focus) {
        cursorApi.setCursor(at, at)
        setEditingFindingId(outcome.focus)
      } else {
        cursorApi.setCursor(at, null)
        setEditingFindingId((prev) =>
          prev && outcome.removed?.id === prev ? null : prev
        )
      }
    },
    [cursorApi, dispatch, lineSpace]
  )

  const extendFinding = React.useCallback(
    (id: FindingId, direction: "up" | "down") => {
      const target = latestRef.current.draft.findings.find((f) => f.id === id)
      if (!target) return

      const from: LineRef =
        direction === "up"
          ? { file: target.anchor.file, line: target.anchor.end }
          : { file: target.anchor.file, line: target.anchor.start }
      const edge: LineRef =
        direction === "up"
          ? { file: target.anchor.file, line: target.anchor.start }
          : { file: target.anchor.file, line: target.anchor.end }
      const nextEdge =
        direction === "up" ? lineSpace.prev(edge) : lineSpace.next(edge)

      if (!nextEdge || nextEdge.file !== target.anchor.file) return

      const outcome = dispatch({
        type: "flagRange",
        from,
        to: nextEdge,
      })
      if (outcome.focus) {
        setEditingFindingId(outcome.focus)
      }
    },
    [dispatch, lineSpace]
  )

  const focusFinding = React.useCallback(
    (finding: Finding, openEditor = true) => {
      const target: LineRef = {
        file: finding.anchor.file,
        line: finding.anchor.start,
      }
      if (target.file && onSelectFile) {
        onSelectFile(target.file)
      }
      cursorApi.setCursor(target, null)
      if (openEditor) {
        setEditingFindingId(finding.id)
      }
    },
    [cursorApi, onSelectFile]
  )

  const layer = React.useMemo<AnnotationLayer>(
    () => ({
      mode: "draft",
      subscribe(listener) {
        listenersRef.current.add(listener)
        return () => {
          listenersRef.current.delete(listener)
        }
      },
      row(at: LineRef): RowAnnotation {
        const { draft: curDraft, cursor, selectionAnchor } = latestRef.current
        const finding = findingAt(curDraft, at)
        const isCursor = cursor !== null && isSameLineRef(cursor, at)
        const isPendingSelection =
          selectionAnchor !== null && isSameLineRef(selectionAnchor, at)
        const interactive = lineSpace.isFlaggable(at)

        if (!finding) {
          return {
            tone: "none",
            rangeEdge: null,
            isCursor,
            isPendingSelection,
            hasThread: false,
            label: interactive ? `Line ${at.line}` : "",
            interactive,
          }
        }

        const sevLabel = finding.severity ? ` (${finding.severity})` : ""
        return {
          tone: "flagged",
          rangeEdge: computeRangeEdge(
            at.line,
            finding.anchor.start,
            finding.anchor.end
          ),
          isCursor,
          isPendingSelection,
          hasThread: at.line === finding.anchor.end,
          label: `Flagged${sevLabel}`,
          interactive,
        }
      },
      threadAfter(at: LineRef): ThreadSlot | null {
        const { draft: curDraft, editingFindingId: curEditing } =
          latestRef.current
        const finding = findingAt(curDraft, at)
        if (!finding || at.line !== finding.anchor.end) {
          return null
        }
        return {
          kind: "draft",
          finding,
          editing: finding.id === curEditing,
        }
      },
      activate,
      startEdit(id) {
        setEditingFindingId(id)
      },
      stopEdit() {
        setEditingFindingId(null)
      },
      updateFinding(id, patch) {
        dispatch({
          type: "editFinding",
          id,
          body: patch.body,
          severity: patch.severity,
        })
      },
      removeFinding(id) {
        dispatch({ type: "removeFinding", id })
        setEditingFindingId((prev) => (prev === id ? null : prev))
      },
      extendFinding,
      setCursor(at) {
        cursorApi.setCursor(at)
      },
    }),
    [activate, cursorApi, dispatch, extendFinding, lineSpace]
  )

  return {
    layer,
    cursorApi,
    editingFindingId,
    setEditingFindingId,
    focusFinding,
  }
}
