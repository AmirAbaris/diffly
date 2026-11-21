import type { LineSpace } from "./line-space"
import {
  compareFindings,
  createFindingId,
  findingAt,
  type Anchor,
  type Finding,
  type FindingId,
  type LineRef,
  type ReviewDraft,
  type Severity,
} from "./model"

export type ReviewCommand =
  | { readonly type: "toggle"; readonly at: LineRef }
  | { readonly type: "flagRange"; readonly from: LineRef; readonly to: LineRef }
  | {
      readonly type: "editFinding"
      readonly id: FindingId
      readonly body?: string
      readonly severity?: Severity | null
    }
  | { readonly type: "removeFinding"; readonly id: FindingId }
  | { readonly type: "restoreFinding"; readonly finding: Finding }
  | { readonly type: "setSummaryNote"; readonly note: string }
  | { readonly type: "reset" }

export interface CommandOutcome {
  readonly draft: ReviewDraft
  readonly removed: Finding | null
  readonly focus: FindingId | null
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

function highestSeverity(findings: readonly Finding[]): Severity | null {
  let best: Severity | null = null
  let bestRank = 0
  for (const f of findings) {
    if (f.severity && SEVERITY_RANK[f.severity] > bestRank) {
      best = f.severity
      bestRank = SEVERITY_RANK[f.severity]
    }
  }
  return best
}

function anchorsOverlap(a: Anchor, b: Anchor): boolean {
  return a.file === b.file && a.start <= b.end && a.end >= b.start
}

export function emptyDraft(): ReviewDraft {
  return {
    findings: [],
    summaryNote: "",
  }
}

export function applyCommand(
  draft: ReviewDraft,
  cmd: ReviewCommand,
  space: LineSpace
): CommandOutcome {
  switch (cmd.type) {
    case "toggle": {
      if (!space.isFlaggable(cmd.at)) {
        return { draft, removed: null, focus: null }
      }
      const existing = findingAt(draft, cmd.at)
      if (existing) {
        const nextFindings = draft.findings.filter((f) => f.id !== existing.id)
        return {
          draft: { ...draft, findings: nextFindings },
          removed: existing,
          focus: null,
        }
      }
      const created: Finding = {
        id: createFindingId(),
        anchor: { file: cmd.at.file, start: cmd.at.line, end: cmd.at.line },
        body: "",
        severity: null,
      }
      const nextFindings = [...draft.findings, created].sort(compareFindings)
      return {
        draft: { ...draft, findings: nextFindings },
        removed: null,
        focus: created.id,
      }
    }

    case "flagRange": {
      if (!space.isFlaggable(cmd.from)) {
        return { draft, removed: null, focus: null }
      }
      const anchor = space.contiguousAnchor(cmd.from, cmd.to)
      const overlapping: Finding[] = []
      const remaining: Finding[] = []

      for (const f of draft.findings) {
        if (anchorsOverlap(f.anchor, anchor)) {
          overlapping.push(f)
        } else {
          remaining.push(f)
        }
      }

      const mergedBody = overlapping
        .map((f) => f.body)
        .filter((b) => b.trim().length > 0)
        .join("\n\n")

      const merged: Finding = {
        id: overlapping.length > 0 ? overlapping[0].id : createFindingId(),
        anchor,
        body: mergedBody,
        severity: highestSeverity(overlapping),
      }

      const nextFindings = [...remaining, merged].sort(compareFindings)
      return {
        draft: { ...draft, findings: nextFindings },
        removed: null,
        focus: merged.id,
      }
    }

    case "editFinding": {
      let found = false
      const nextFindings = draft.findings.map((f) => {
        if (f.id !== cmd.id) return f
        found = true
        return {
          ...f,
          body: cmd.body !== undefined ? cmd.body : f.body,
          severity: cmd.severity !== undefined ? cmd.severity : f.severity,
        }
      })
      if (!found) {
        return { draft, removed: null, focus: null }
      }
      return {
        draft: { ...draft, findings: nextFindings },
        removed: null,
        focus: cmd.id,
      }
    }

    case "removeFinding": {
      const target = draft.findings.find((f) => f.id === cmd.id)
      if (!target) {
        return { draft, removed: null, focus: null }
      }
      const nextFindings = draft.findings.filter((f) => f.id !== cmd.id)
      return {
        draft: { ...draft, findings: nextFindings },
        removed: target,
        focus: null,
      }
    }

    case "restoreFinding": {
      const remaining = draft.findings.filter(
        (f) =>
          f.id !== cmd.finding.id &&
          !anchorsOverlap(f.anchor, cmd.finding.anchor)
      )
      const nextFindings = [...remaining, cmd.finding].sort(compareFindings)
      return {
        draft: { ...draft, findings: nextFindings },
        removed: null,
        focus: cmd.finding.id,
      }
    }

    case "setSummaryNote": {
      return {
        draft: { ...draft, summaryNote: cmd.note },
        removed: null,
        focus: null,
      }
    }

    case "reset": {
      return {
        draft: emptyDraft(),
        removed: null,
        focus: null,
      }
    }
  }
}
