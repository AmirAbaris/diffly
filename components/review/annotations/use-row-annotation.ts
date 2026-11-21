"use client"

import * as React from "react"
import type { LineRef } from "@/lib/review"
import {
  DEFAULT_ROW_ANNOTATION,
  useAnnotationLayer,
  type RowAnnotation,
  type ThreadSlot,
} from "./annotation-layer"

const noopSubscribe = () => () => {}

function isSameRowAnnotation(a: RowAnnotation, b: RowAnnotation): boolean {
  return (
    a.tone === b.tone &&
    a.rangeEdge === b.rangeEdge &&
    a.isCursor === b.isCursor &&
    a.isPendingSelection === b.isPendingSelection &&
    a.hasThread === b.hasThread &&
    a.label === b.label &&
    a.interactive === b.interactive
  )
}

function isSameThreadSlot(a: ThreadSlot | null, b: ThreadSlot | null): boolean {
  if (a === b) return true
  if (!a || !b || a.kind !== b.kind) return false

  if (a.kind === "draft" && b.kind === "draft") {
    return (
      a.editing === b.editing &&
      a.finding.id === b.finding.id &&
      a.finding.body === b.finding.body &&
      a.finding.severity === b.finding.severity &&
      a.finding.anchor.file === b.finding.anchor.file &&
      a.finding.anchor.start === b.finding.anchor.start &&
      a.finding.anchor.end === b.finding.anchor.end
    )
  }

  if (a.kind === "verdict" && b.kind === "verdict") {
    return (
      a.mark.file === b.mark.file &&
      a.mark.start === b.mark.start &&
      a.mark.end === b.mark.end &&
      a.mark.tone === b.mark.tone &&
      a.mark.label === b.mark.label &&
      a.mark.findingId === b.mark.findingId &&
      a.mark.defectId === b.mark.defectId
    )
  }

  return false
}

export function useRowAnnotation(at: LineRef | null): RowAnnotation {
  const layer = useAnnotationLayer()
  const cacheRef = React.useRef<RowAnnotation>(DEFAULT_ROW_ANNOTATION)

  const subscribe = React.useCallback(
    (listener: () => void) => {
      if (!layer) return noopSubscribe()
      return layer.subscribe(listener)
    },
    [layer]
  )

  const getSnapshot = React.useCallback((): RowAnnotation => {
    const next = layer && at ? layer.row(at) : DEFAULT_ROW_ANNOTATION
    if (isSameRowAnnotation(cacheRef.current, next)) {
      return cacheRef.current
    }
    cacheRef.current = next
    return next
  }, [layer, at])

  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useThreadSlot(at: LineRef | null): ThreadSlot | null {
  const layer = useAnnotationLayer()
  const cacheRef = React.useRef<ThreadSlot | null>(null)

  const subscribe = React.useCallback(
    (listener: () => void) => {
      if (!layer) return noopSubscribe()
      return layer.subscribe(listener)
    },
    [layer]
  )

  const getSnapshot = React.useCallback((): ThreadSlot | null => {
    const next = layer && at ? layer.threadAfter(at) : null
    if (isSameThreadSlot(cacheRef.current, next)) {
      return cacheRef.current
    }
    cacheRef.current = next
    return next
  }, [layer, at])

  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
