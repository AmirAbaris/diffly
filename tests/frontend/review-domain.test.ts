import { describe, expect, it } from "vitest"
import {
  applyCommand,
  asFindingId,
  buildLineSpace,
  emptyDraft,
  expandFlaggedLines,
  findingAt,
  formatAnchor,
  MAX_ANCHOR_SPAN,
  MIN_REVIEW_TEXT_CHARS,
  parsePatchSelectableLines,
  validateReview,
  type ReviewDraft,
} from "@/lib/review"
import contractCases from "../fixtures/review-contract-cases.json"

describe("review-contract-cases.json", () => {
  it("matches contract constants", () => {
    expect(MAX_ANCHOR_SPAN).toBe(contractCases.constants.max_anchor_span)
    expect(MIN_REVIEW_TEXT_CHARS).toBe(
      contractCases.constants.min_review_text_chars
    )
  })

  it.each(contractCases.validation_cases)(
    "validates $name",
    ({ findings, summary_note, valid, expected_blockers }) => {
      const draft: ReviewDraft = {
        findings: findings.map((f) => ({
          id: asFindingId(f.id),
          anchor: { file: f.file_path, start: f.start_line, end: f.end_line },
          body: f.body,
          severity: f.severity as ReviewDraft["findings"][number]["severity"],
        })),
        summaryNote: summary_note,
      }
      const result = validateReview(draft)
      expect(result.valid).toBe(valid)
      expect(result.blockers).toEqual(expected_blockers)
    }
  )
})

describe("parsePatchSelectableLines & buildLineSpace", () => {
  it("builds a LineSpace for a single code snippet", () => {
    const space = buildLineSpace({ code: "line 1\nline 2\nline 3" })
    expect(space.files).toEqual([null])
    expect(space.isFlaggable({ file: null, line: 1 })).toBe(true)
    expect(space.isFlaggable({ file: null, line: 3 })).toBe(true)
    expect(space.isFlaggable({ file: null, line: 4 })).toBe(false)
    expect(space.next({ file: null, line: 1 })).toEqual({ file: null, line: 2 })
    expect(space.prev({ file: null, line: 1 })).toBeNull()
  })

  it("groups unified patch lines by hunk and skips deleted-only lines", () => {
    const patch = [
      "@@ -10,4 +10,4 @@",
      " keep_a()",
      "-old_line()",
      "+new_line()",
      " keep_b()",
      "@@ -30,2 +30,3 @@",
      " hunk2_a()",
      "+hunk2_added()",
      " hunk2_b()",
    ].join("\n")

    expect(parsePatchSelectableLines(patch)).toEqual([
      [10, 11, 12],
      [30, 31, 32],
    ])

    const space = buildLineSpace({
      files: [{ path: "auth.py", language: "python", patch }],
    })
    expect(space.isFlaggable({ file: "auth.py", line: 11 })).toBe(true)
    expect(space.isFlaggable({ file: "auth.py", line: 15 })).toBe(false)
    expect(space.next({ file: "auth.py", line: 12 })).toEqual({
      file: "auth.py",
      line: 30,
    })
    expect(space.prev({ file: "auth.py", line: 30 })).toEqual({
      file: "auth.py",
      line: 12,
    })
    expect(
      space.contiguousAnchor(
        { file: "auth.py", line: 10 },
        { file: "auth.py", line: 31 }
      )
    ).toEqual({ file: "auth.py", start: 10, end: 12 })
  })

  it("navigates across files and clamps contiguousAnchor at file boundaries", () => {
    const space = buildLineSpace({
      files: [
        { path: "a.py", language: "python", content: "1\n2\n3" },
        { path: "b.py", language: "python", content: "1\n2" },
      ],
    })
    expect(space.files).toEqual(["a.py", "b.py"])
    expect(space.next({ file: "a.py", line: 3 })).toEqual({
      file: "b.py",
      line: 1,
    })
    expect(space.prev({ file: "b.py", line: 1 })).toEqual({
      file: "a.py",
      line: 3,
    })
    expect(
      space.contiguousAnchor(
        { file: "a.py", line: 2 },
        { file: "b.py", line: 2 }
      )
    ).toEqual({ file: "a.py", start: 2, end: 3 })
  })
})

describe("applyCommand & draft invariants", () => {
  it("toggles findings on/off and keeps them sorted", () => {
    const space = buildLineSpace({ code: "1\n2\n3\n4\n5" })
    let draft = emptyDraft()

    const out1 = applyCommand(
      draft,
      { type: "toggle", at: { file: null, line: 4 } },
      space
    )
    draft = out1.draft
    expect(draft.findings).toHaveLength(1)
    expect(out1.focus).toBe(draft.findings[0].id)

    draft = applyCommand(
      draft,
      { type: "toggle", at: { file: null, line: 2 } },
      space
    ).draft
    expect(draft.findings.map((f) => f.anchor.start)).toEqual([2, 4])

    const outOff = applyCommand(
      draft,
      { type: "toggle", at: { file: null, line: 4 } },
      space
    )
    expect(outOff.removed?.anchor.start).toBe(4)
    expect(outOff.draft.findings.map((f) => f.anchor.start)).toEqual([2])

    const outInvalid = applyCommand(
      outOff.draft,
      { type: "toggle", at: { file: null, line: 99 } },
      space
    )
    expect(outInvalid.draft).toBe(outOff.draft)
    expect(outInvalid.focus).toBeNull()
  })

  it("clamps flagRange to MAX_ANCHOR_SPAN in both directions", () => {
    const lines = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join(
      "\n"
    )
    const space = buildLineSpace({ code: lines })

    const forward = applyCommand(
      emptyDraft(),
      {
        type: "flagRange",
        from: { file: null, line: 3 },
        to: { file: null, line: 35 },
      },
      space
    )
    expect(forward.draft.findings[0].anchor).toEqual({
      file: null,
      start: 3,
      end: 3 + MAX_ANCHOR_SPAN - 1,
    })

    const backward = applyCommand(
      emptyDraft(),
      {
        type: "flagRange",
        from: { file: null, line: 30 },
        to: { file: null, line: 1 },
      },
      space
    )
    expect(backward.draft.findings[0].anchor).toEqual({
      file: null,
      start: 30 - (MAX_ANCHOR_SPAN - 1),
      end: 30,
    })
  })

  it("absorbs overlapping findings on flagRange and supports undo restore", () => {
    const space = buildLineSpace({
      files: [
        {
          path: "api/auth.py",
          language: "python",
          content: "1\n2\n3\n4\n5\n6",
        },
      ],
    })

    let draft = applyCommand(
      emptyDraft(),
      { type: "toggle", at: { file: "api/auth.py", line: 2 } },
      space
    ).draft
    draft = applyCommand(
      draft,
      {
        type: "editFinding",
        id: draft.findings[0].id,
        body: "First note",
        severity: "low",
      },
      space
    ).draft
    draft = applyCommand(
      draft,
      { type: "toggle", at: { file: "api/auth.py", line: 4 } },
      space
    ).draft
    draft = applyCommand(
      draft,
      {
        type: "editFinding",
        id: draft.findings[1].id,
        body: "Second note",
        severity: "critical",
      },
      space
    ).draft

    const mergedOutcome = applyCommand(
      draft,
      {
        type: "flagRange",
        from: { file: "api/auth.py", line: 2 },
        to: { file: "api/auth.py", line: 5 },
      },
      space
    )
    expect(mergedOutcome.draft.findings).toHaveLength(1)
    const merged = mergedOutcome.draft.findings[0]
    expect(merged.anchor).toEqual({ file: "api/auth.py", start: 2, end: 5 })
    expect(merged.body).toBe("First note\n\nSecond note")
    expect(merged.severity).toBe("critical")
    expect(formatAnchor(merged.anchor)).toBe("auth.py:L2-L5")
    expect(
      findingAt(mergedOutcome.draft, { file: "api/auth.py", line: 3 })?.id
    ).toBe(merged.id)
    expect(expandFlaggedLines(mergedOutcome.draft)).toEqual([
      { file_path: "api/auth.py", line_number: 2 },
      { file_path: "api/auth.py", line_number: 3 },
      { file_path: "api/auth.py", line_number: 4 },
      { file_path: "api/auth.py", line_number: 5 },
    ])

    const removedOutcome = applyCommand(
      mergedOutcome.draft,
      { type: "removeFinding", id: merged.id },
      space
    )
    expect(removedOutcome.draft.findings).toHaveLength(0)
    expect(removedOutcome.removed).toEqual(merged)

    const restoredOutcome = applyCommand(
      removedOutcome.draft,
      { type: "restoreFinding", finding: merged },
      space
    )
    expect(restoredOutcome.draft.findings).toEqual([merged])
  })
})
