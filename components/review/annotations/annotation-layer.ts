"use client"

import * as React from "react"
import type {
  Finding,
  FindingId,
  FindingVerdict,
  LineRef,
  Severity,
  VerdictMark,
  VerdictTone,
} from "@/lib/review"
import type {
  ChallengeExpectedIssue,
  DetectedIssue,
  MissedIssue,
} from "@/types/challenge"

export type RangeEdge = "single" | "start" | "middle" | "end" | null

export interface RowAnnotation {
  readonly tone: "none" | "flagged" | VerdictTone
  readonly rangeEdge: RangeEdge
  readonly isCursor: boolean
  readonly isPendingSelection: boolean
  readonly hasThread: boolean
  readonly label: string
  readonly interactive: boolean
}

export type ThreadSlot =
  | {
      readonly kind: "draft"
      readonly finding: Finding
      readonly editing: boolean
    }
  | {
      readonly kind: "verdict"
      readonly mark: VerdictMark
      readonly defect?:
        DetectedIssue | MissedIssue | ChallengeExpectedIssue | null
      readonly finding?: Finding | null
      readonly verdict?: FindingVerdict | null
    }

export interface AnnotationActivateMods {
  readonly shiftKey?: boolean
}

export interface AnnotationLayer {
  readonly mode: "draft" | "verdict"
  subscribe: (listener: () => void) => () => void
  row: (at: LineRef) => RowAnnotation
  threadAfter: (at: LineRef) => ThreadSlot | null
  activate: (at: LineRef, mods?: AnnotationActivateMods) => void
  startEdit?: (id: FindingId) => void
  stopEdit?: () => void
  updateFinding?: (
    id: FindingId,
    patch: { body?: string; severity?: Severity | null }
  ) => void
  removeFinding?: (id: FindingId) => void
  extendFinding?: (id: FindingId, direction: "up" | "down") => void
  setCursor?: (at: LineRef | null) => void
}

export const DEFAULT_ROW_ANNOTATION: RowAnnotation = {
  tone: "none",
  rangeEdge: null,
  isCursor: false,
  isPendingSelection: false,
  hasThread: false,
  label: "",
  interactive: false,
}

const AnnotationLayerContext = React.createContext<AnnotationLayer | null>(null)

export interface AnnotationProviderProps {
  layer: AnnotationLayer | null
  children: React.ReactNode
}

export function AnnotationProvider({
  layer,
  children,
}: AnnotationProviderProps) {
  return React.createElement(
    AnnotationLayerContext.Provider,
    { value: layer },
    children
  )
}

export function useAnnotationLayer(): AnnotationLayer | null {
  return React.useContext(AnnotationLayerContext)
}
