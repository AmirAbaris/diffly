import type { ChallengeSolutionResponse, FlaggedLine } from "@/types/challenge"
import type { GradeReport } from "./draft-codec"
import {
  compareFileKeys,
  type FindingId,
  type LineRef,
  toLineRef,
} from "./model"

export type VerdictTone =
  "verdict-hit" | "verdict-miss" | "verdict-false" | "muted"

export interface VerdictMark {
  readonly file: string | null
  readonly start: number
  readonly end: number
  readonly tone: VerdictTone
  readonly label: string
  readonly findingId?: FindingId
  readonly defectId?: string | null
}

function groupContiguousLines(
  lines: readonly FlaggedLine[]
): Array<{ file: string | null; start: number; end: number }> {
  const refs: LineRef[] = lines.map(toLineRef).sort((a, b) => {
    const fileCmp = compareFileKeys(a.file, b.file)
    return fileCmp !== 0 ? fileCmp : a.line - b.line
  })

  const spans: Array<{ file: string | null; start: number; end: number }> = []
  for (const ref of refs) {
    const prev = spans[spans.length - 1]
    if (prev && prev.file === ref.file && ref.line <= prev.end + 1) {
      prev.end = Math.max(prev.end, ref.line)
    } else {
      spans.push({ file: ref.file, start: ref.line, end: ref.line })
    }
  }
  return spans
}

export function buildVerdictOverlay(
  report: GradeReport,
  solution?: ChallengeSolutionResponse | null
): readonly VerdictMark[] {
  const marks: VerdictMark[] = []

  for (const finding of report.findings) {
    const verdict = report.verdicts.get(finding.id)
    if (!verdict) continue

    let tone: VerdictTone
    let label: string
    if (verdict.verdict === "matched") {
      tone = "verdict-hit"
      label = "Matched"
    } else if (verdict.verdict === "false_positive") {
      tone = "verdict-false"
      label = "False positive"
    } else {
      tone = "muted"
      label = "Redundant"
    }

    marks.push({
      file: finding.anchor.file,
      start: finding.anchor.start,
      end: finding.anchor.end,
      tone,
      label,
      findingId: finding.id,
      defectId: verdict.defectId,
    })
  }

  const coveredMissedIds = new Set<string>()
  for (const issue of report.missed) {
    if (!issue.expected_lines || issue.expected_lines.length === 0) {
      continue
    }
    coveredMissedIds.add(issue.id)
    for (const span of groupContiguousLines(issue.expected_lines)) {
      marks.push({
        file: span.file,
        start: span.start,
        end: span.end,
        tone: "verdict-miss",
        label: issue.title || "Missed",
        defectId: issue.id,
      })
    }
  }

  // Only emit FN marks from solution when expected lines are explicitly present.
  if (solution?.expected_issues) {
    const detectedIds = new Set(report.detected.map((d) => d.id))
    for (const expected of solution.expected_issues) {
      if (detectedIds.has(expected.id) || coveredMissedIds.has(expected.id)) {
        continue
      }
      const expectedLines = expected.lines ?? expected.matched_lines
      if (!expectedLines || expectedLines.length === 0) {
        continue
      }
      for (const span of groupContiguousLines(expectedLines)) {
        marks.push({
          file: span.file,
          start: span.start,
          end: span.end,
          tone: "verdict-miss",
          label: expected.title || "Missed",
          defectId: expected.id,
        })
      }
    }
  }

  return marks
}
