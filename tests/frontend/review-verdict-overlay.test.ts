import { describe, expect, it } from "vitest"
import {
  asFindingId,
  buildVerdictOverlay,
  parseGradeReport,
  parseStoredDraft,
  serializeStoredDraft,
  toSubmissionBody,
  type ReviewDraft,
} from "@/lib/review"
import type {
  ChallengeSolutionResponse,
  ReviewSubmissionResponse,
} from "@/types/challenge"

describe("draft-codec & verdict-overlay", () => {
  it("migrates v1 drafts to v2 and round-trips v2 drafts", () => {
    const migrated = parseStoredDraft({
      flaggedLines: [5, { file_path: "app.py", line_number: 12 }, 5],
      comment: "Legacy comment",
    })
    expect(migrated.summaryNote).toBe("Legacy comment")
    expect(migrated.findings.map((f) => f.anchor)).toEqual([
      { file: null, start: 5, end: 5 },
      { file: "app.py", start: 12, end: 12 },
    ])
    const serialized = serializeStoredDraft(migrated)
    expect(parseStoredDraft(JSON.parse(serialized))).toEqual(migrated)
  })

  it("serializes submission body and parses grade report + verdict overlay", () => {
    const draft: ReviewDraft = {
      findings: [
        {
          id: asFindingId("f-hit"),
          anchor: { file: "auth.py", start: 10, end: 12 },
          body: "Missing CSRF check",
          severity: "high",
        },
        {
          id: asFindingId("f-fp"),
          anchor: { file: "auth.py", start: 20, end: 20 },
          body: "Looks wrong",
          severity: "low",
        },
      ],
      summaryNote: "  Overall summary  ",
    }

    const req = toSubmissionBody(draft, true)
    expect(req.reveal).toBe(true)
    expect(req.comments).toBe("Overall summary")
    expect(req.findings).toHaveLength(2)
    expect(req.flagged_lines).toEqual([
      { file_path: "auth.py", line_number: 10 },
      { file_path: "auth.py", line_number: 11 },
      { file_path: "auth.py", line_number: 12 },
      { file_path: "auth.py", line_number: 20 },
    ])

    const response: ReviewSubmissionResponse = {
      submission_id: 1,
      id: 1,
      score: 75,
      feedback: "Good catch",
      comments: "Overall summary",
      created_at: "2026-11-21T00:00:00Z",
      detected_issues: [
        { id: "d1", title: "CSRF", severity: "high", finding_ids: ["f-hit"] },
      ],
      missed_issues: [
        {
          id: "d2",
          title: "Open redirect",
          severity: "medium",
          expected_lines: [{ file_path: "auth.py", line_number: 30 }],
        },
      ],
      findings: req.findings,
      finding_verdicts: [
        {
          finding_id: "f-hit",
          verdict: "matched",
          defect_id: "d1",
          line_score: 1,
          severity_agrees: true,
        },
        {
          finding_id: "f-fp",
          verdict: "false_positive",
          defect_id: null,
          line_score: 0,
          severity_agrees: null,
        },
      ],
    }

    const report = parseGradeReport(response)
    expect(report.score).toBe(75)
    expect(report.verdicts.get(asFindingId("f-hit"))?.verdict).toBe("matched")

    const solution: ChallengeSolutionResponse = {
      id: 1,
      challenge_id: 1,
      slug: "auth-drill",
      canonical_review: "Fix CSRF and redirect",
      recommended_fix_diff: "",
      expected_issues: [
        {
          id: "d1",
          title: "CSRF",
          severity: "high",
          lines: [{ file_path: "auth.py", line_number: 10 }],
          keywords: ["csrf"],
          explanation: "CSRF",
        },
        {
          id: "d3",
          title: "Hidden defect",
          severity: "low",
          lines: [{ file_path: "auth.py", line_number: 42 }],
          keywords: ["leak"],
          explanation: "Leak",
        },
      ],
    }

    const marks = buildVerdictOverlay(report, solution)
    expect(marks.map((m) => [m.tone, m.start, m.end, m.label])).toEqual([
      ["verdict-hit", 10, 12, "Matched"],
      ["verdict-false", 20, 20, "False positive"],
      ["verdict-miss", 30, 30, "Open redirect"],
      ["verdict-miss", 42, 42, "Hidden defect"],
    ])
    expect(marks[0].findingId).toBe(asFindingId("f-hit"))
    expect(marks[0].defectId).toBe("d1")

    const reportWithoutExpected = parseGradeReport({
      ...response,
      missed_issues: [{ id: "d2", title: "Open redirect", severity: "medium" }],
    })
    expect(
      buildVerdictOverlay(reportWithoutExpected).filter(
        (m) => m.tone === "verdict-miss"
      )
    ).toEqual([])
  })

  it("parses nested anchor findings returned by the backend review API", () => {
    const backendResponse = {
      submission_id: 23,
      id: 23,
      score: 100,
      feedback: "Outstanding review!",
      comments: "",
      created_at: "2026-11-26T17:17:44.843305Z",
      detected_issues: [
        {
          id: "crit-rce-eval",
          title: "Arbitrary Code Execution via Unsanitized eval()",
          severity: "critical",
          matched_lines: [28, 29, 30, 31],
          finding_ids: ["f1"],
          explanation: "eval() allows RCE.",
        },
      ],
      missed_issues: [],
      flagged_lines: [28, 29, 30, 31],
      findings: [
        {
          id: "f1",
          anchor: {
            file_path: null,
            start_line: 28,
            end_line: 31,
          },
          body: "eval allows RCE",
          severity: "critical",
        },
      ],
      finding_verdicts: [
        {
          finding_id: "f1",
          verdict: "matched",
          defect_id: "crit-rce-eval",
          line_score: 1,
          severity_agrees: true,
        },
      ],
    } as unknown as ReviewSubmissionResponse

    const report = parseGradeReport(backendResponse)
    expect(report.findings).toEqual([
      {
        id: asFindingId("f1"),
        anchor: { file: null, start: 28, end: 31 },
        body: "eval allows RCE",
        severity: "critical",
      },
    ])

    const marks = buildVerdictOverlay(report)
    expect(marks).toEqual([
      {
        file: null,
        start: 28,
        end: 31,
        tone: "verdict-hit",
        label: "Matched",
        findingId: asFindingId("f1"),
        defectId: "crit-rce-eval",
      },
    ])
  })
})
