import { normalizeStoredFlaggedLines } from "@/lib/flagged-lines"
import type {
  DetectedIssue,
  MissedIssue,
  ReviewFindingPayload,
  ReviewSubmissionRequest,
  ReviewSubmissionResponse,
} from "@/types/challenge"
import { emptyDraft } from "./draft-reducer"
import {
  asFindingId,
  compareFindings,
  createFindingId,
  expandFlaggedLines,
  SEVERITIES,
  type Finding,
  type FindingId,
  type ReviewDraft,
  type Severity,
} from "./model"

export interface FindingVerdict {
  readonly findingId: FindingId
  readonly verdict: "matched" | "redundant" | "false_positive"
  readonly defectId: string | null
  readonly lineScore: number
  readonly severityAgrees: boolean | null
}

export interface GradeReport {
  readonly score: number
  readonly verdicts: ReadonlyMap<FindingId, FindingVerdict>
  readonly detected: readonly DetectedIssue[]
  readonly missed: readonly MissedIssue[]
  readonly findings: readonly Finding[]
  readonly summaryNote: string
}

function isValidSeverity(value: unknown): value is Severity {
  return (
    typeof value === "string" &&
    (SEVERITIES as readonly string[]).includes(value)
  )
}

function parseV2Finding(raw: unknown): Finding | null {
  if (!raw || typeof raw !== "object") return null
  const candidate = raw as Record<string, unknown>
  const anchorRaw = candidate.anchor
  if (!anchorRaw || typeof anchorRaw !== "object") return null

  const anchorObj = anchorRaw as Record<string, unknown>
  const file =
    typeof anchorObj.file === "string" && anchorObj.file.trim().length > 0
      ? anchorObj.file.trim()
      : null
  const start = anchorObj.start
  const end = anchorObj.end

  if (
    typeof start !== "number" ||
    !Number.isInteger(start) ||
    start < 1 ||
    typeof end !== "number" ||
    !Number.isInteger(end) ||
    end < start
  ) {
    return null
  }

  const id =
    typeof candidate.id === "string" && candidate.id.length > 0
      ? asFindingId(candidate.id)
      : createFindingId()

  return {
    id,
    anchor: { file, start, end },
    body: typeof candidate.body === "string" ? candidate.body : "",
    severity: isValidSeverity(candidate.severity) ? candidate.severity : null,
  }
}

export function parseStoredDraft(raw: unknown): ReviewDraft {
  if (!raw || typeof raw !== "object") {
    return emptyDraft()
  }

  const obj = raw as Record<string, unknown>

  if (obj.version === 2 && Array.isArray(obj.findings)) {
    const parsedFindings: Finding[] = []
    for (const item of obj.findings) {
      const finding = parseV2Finding(item)
      if (finding) {
        parsedFindings.push(finding)
      }
    }
    parsedFindings.sort(compareFindings)

    return {
      findings: parsedFindings,
      summaryNote: typeof obj.summaryNote === "string" ? obj.summaryNote : "",
    }
  }

  // Migrate v1 { flaggedLines, comments | comment } into 1-line findings.
  const hasV1Shape =
    Array.isArray(obj.flaggedLines) ||
    typeof obj.comments === "string" ||
    typeof obj.comment === "string"

  if (!hasV1Shape) {
    return emptyDraft()
  }

  const normalizedLines = normalizeStoredFlaggedLines(obj.flaggedLines)
  const seen = new Set<string>()
  const migratedFindings: Finding[] = []

  for (const item of normalizedLines) {
    const file = typeof item === "number" ? null : item.file_path
    const line = typeof item === "number" ? item : item.line_number
    const dedupKey = `${file ?? ""}:${line}`
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)

    migratedFindings.push({
      id: createFindingId(),
      anchor: { file, start: line, end: line },
      body: "",
      severity: null,
    })
  }

  migratedFindings.sort(compareFindings)

  const summaryNote =
    typeof obj.comments === "string"
      ? obj.comments
      : typeof obj.comment === "string"
        ? obj.comment
        : ""

  return {
    findings: migratedFindings,
    summaryNote,
  }
}

export function serializeStoredDraft(draft: ReviewDraft): string {
  return JSON.stringify({
    version: 2,
    findings: draft.findings,
    summaryNote: draft.summaryNote,
    updatedAt: new Date().toISOString(),
  })
}

export function toSubmissionBody(
  draft: ReviewDraft,
  reveal?: boolean
): ReviewSubmissionRequest {
  const findings: ReviewFindingPayload[] = draft.findings.map((f) => ({
    id: f.id,
    file_path: f.anchor.file,
    start_line: f.anchor.start,
    end_line: f.anchor.end,
    body: f.body,
    severity: f.severity,
  }))

  const body: ReviewSubmissionRequest = {
    findings,
    flagged_lines: expandFlaggedLines(draft),
    comments: draft.summaryNote.trim(),
  }

  if (reveal !== undefined) {
    body.reveal = reveal
  }

  return body
}

function payloadToFinding(payload: ReviewFindingPayload): Finding {
  return {
    id: asFindingId(payload.id),
    anchor: {
      file: payload.file_path,
      start: payload.start_line,
      end: payload.end_line,
    },
    body: payload.body,
    severity: payload.severity,
  }
}

export function parseGradeReport(raw: ReviewSubmissionResponse): GradeReport {
  const verdicts = new Map<FindingId, FindingVerdict>()
  for (const v of raw.finding_verdicts ?? []) {
    const findingId = asFindingId(v.finding_id)
    verdicts.set(findingId, {
      findingId,
      verdict: v.verdict,
      defectId: v.defect_id ?? null,
      lineScore: v.line_score,
      severityAgrees: v.severity_agrees ?? null,
    })
  }

  const findings = (raw.findings ?? []).map(payloadToFinding)

  return {
    score: raw.score,
    verdicts,
    detected: raw.detected_issues ?? [],
    missed: raw.missed_issues ?? [],
    findings,
    summaryNote: raw.comments ?? "",
  }
}
