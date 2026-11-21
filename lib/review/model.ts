import type { FindingSeverity, FlaggedLine } from "@/types/challenge"

export const MAX_ANCHOR_SPAN = 15

export const SEVERITIES = ["critical", "high", "medium", "low"] as const

export type Severity = FindingSeverity

export interface LineRef {
  readonly file: string | null
  readonly line: number
}

export interface Anchor {
  readonly file: string | null
  readonly start: number
  readonly end: number
}

export type FindingId = string & { readonly __brand: "FindingId" }

export interface Finding {
  readonly id: FindingId
  readonly anchor: Anchor
  readonly body: string
  readonly severity: Severity | null
}

export interface ReviewDraft {
  readonly findings: readonly Finding[]
  readonly summaryNote: string
}

let idCounter = 0

export function asFindingId(id: string): FindingId {
  return id as FindingId
}

export function createFindingId(): FindingId {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return asFindingId(crypto.randomUUID())
  }
  idCounter += 1
  return asFindingId(`finding-${Date.now()}-${idCounter}`)
}

export function compareFileKeys(a: string | null, b: string | null): number {
  const fa = a ?? ""
  const fb = b ?? ""
  return fa < fb ? -1 : fa > fb ? 1 : 0
}

export function compareFindings(a: Finding, b: Finding): number {
  const fileCmp = compareFileKeys(a.anchor.file, b.anchor.file)
  if (fileCmp !== 0) return fileCmp
  return a.anchor.start - b.anchor.start
}

export function lineRefKey(ref: LineRef): string {
  return ref.file === null ? `:${ref.line}` : `${ref.file}:${ref.line}`
}

export function isSameLineRef(a: LineRef, b: LineRef): boolean {
  return a.file === b.file && a.line === b.line
}

export function formatAnchor(anchor: Anchor): string {
  const range =
    anchor.start === anchor.end
      ? `L${anchor.start}`
      : `L${anchor.start}-L${anchor.end}`
  if (!anchor.file) {
    return range
  }
  const baseName = anchor.file.split("/").pop() || anchor.file
  return `${baseName}:${range}`
}

/**
 * Binary search over sorted, pairwise-disjoint findings within a file.
 */
export function findingAt(draft: ReviewDraft, at: LineRef): Finding | null {
  const { findings } = draft
  let lo = 0
  let hi = findings.length - 1

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const candidate = findings[mid]
    const fileCmp = compareFileKeys(candidate.anchor.file, at.file)

    if (fileCmp < 0) {
      lo = mid + 1
    } else if (fileCmp > 0) {
      hi = mid - 1
    } else if (at.line < candidate.anchor.start) {
      hi = mid - 1
    } else if (at.line > candidate.anchor.end) {
      lo = mid + 1
    } else {
      return candidate
    }
  }

  return null
}

export function expandFlaggedLines(draft: ReviewDraft): FlaggedLine[] {
  const result: FlaggedLine[] = []
  for (const finding of draft.findings) {
    for (let line = finding.anchor.start; line <= finding.anchor.end; line++) {
      if (finding.anchor.file === null) {
        result.push(line)
      } else {
        result.push({
          file_path: finding.anchor.file,
          line_number: line,
        })
      }
    }
  }
  return result
}

export function toLineRef(flaggedLine: FlaggedLine): LineRef {
  if (typeof flaggedLine === "number") {
    return { file: null, line: flaggedLine }
  }
  return { file: flaggedLine.file_path, line: flaggedLine.line_number }
}
