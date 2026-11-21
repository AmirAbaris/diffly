"use client"

import * as React from "react"
import {
  buildVerdictOverlay,
  type GradeReport,
  type LineRef,
  type VerdictMark,
} from "@/lib/review"
import type { ChallengeSolutionResponse } from "@/types/challenge"
import type {
  AnnotationLayer,
  RangeEdge,
  RowAnnotation,
  ThreadSlot,
} from "./annotation-layer"

export interface UseVerdictAnnotationLayerOptions {
  report: GradeReport | null
  solution?: ChallengeSolutionResponse | null
}

function computeRangeEdge(line: number, start: number, end: number): RangeEdge {
  if (start === end) return "single"
  if (line === start) return "start"
  if (line === end) return "end"
  return "middle"
}

export function useVerdictAnnotationLayer({
  report,
  solution,
}: UseVerdictAnnotationLayerOptions): AnnotationLayer {
  const marks = React.useMemo<readonly VerdictMark[]>(() => {
    if (!report) return []
    return buildVerdictOverlay(report, solution)
  }, [report, solution])

  const listenersRef = React.useRef(new Set<() => void>())
  const marksRef = React.useRef(marks)

  React.useEffect(() => {
    marksRef.current = marks
    for (const listener of listenersRef.current) {
      listener()
    }
  }, [marks])

  return React.useMemo<AnnotationLayer>(() => {
    const findMarkAt = (at: LineRef): VerdictMark | null => {
      for (const mark of marks) {
        if (
          mark.file === at.file &&
          at.line >= mark.start &&
          at.line <= mark.end
        ) {
          return mark
        }
      }
      return null
    }

    const findMarkEndingAt = (at: LineRef): VerdictMark | null => {
      for (const mark of marks) {
        if (mark.file === at.file && mark.end === at.line) {
          return mark
        }
      }
      return null
    }

    return {
      mode: "verdict",
      subscribe(listener) {
        listenersRef.current.add(listener)
        return () => {
          listenersRef.current.delete(listener)
        }
      },
      row(at: LineRef): RowAnnotation {
        const mark = findMarkAt(at)
        if (!mark) {
          return {
            tone: "none",
            rangeEdge: null,
            isCursor: false,
            isPendingSelection: false,
            hasThread: false,
            label: "",
            interactive: false,
          }
        }
        return {
          tone: mark.tone,
          rangeEdge: computeRangeEdge(at.line, mark.start, mark.end),
          isCursor: false,
          isPendingSelection: false,
          hasThread: at.line === mark.end,
          label: mark.label,
          interactive: false,
        }
      },
      threadAfter(at: LineRef): ThreadSlot | null {
        const mark = findMarkEndingAt(at)
        if (!mark) return null

        const finding = mark.findingId
          ? (report?.findings.find((f) => f.id === mark.findingId) ?? null)
          : null
        const verdict = mark.findingId
          ? (report?.verdicts.get(mark.findingId) ?? null)
          : null
        const defect = mark.defectId
          ? (report?.detected.find((d) => d.id === mark.defectId) ??
            report?.missed.find((m) => m.id === mark.defectId) ??
            solution?.expected_issues?.find((e) => e.id === mark.defectId) ??
            null)
          : null

        return {
          kind: "verdict",
          mark,
          defect,
          finding,
          verdict,
        }
      },
      activate() {
        // Verdict overlay is read-only.
      },
    }
  }, [marks, report, solution])
}
