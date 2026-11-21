import * as React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AnnotationProvider } from "@/components/review/annotations/annotation-layer"
import { ShortcutOverlay } from "@/components/review/annotations/shortcut-overlay"
import { useDraftAnnotationLayer } from "@/components/review/annotations/use-draft-annotation-layer"
import { useReviewHotkeys } from "@/components/review/annotations/use-review-hotkeys"
import { CodeViewer } from "@/components/review/code-viewer"
import { AnnotatedCodeTab } from "@/components/review/comparison/annotated-code-tab"
import { useReviewDraft } from "@/hooks/use-review-draft"
import {
  asFindingId,
  buildLineSpace,
  findingAt,
  parseGradeReport,
} from "@/lib/review"
import type {
  ChallengeSolutionResponse,
  ReviewSubmissionResponse,
} from "@/types/challenge"

const SAMPLE_CODE = [
  "def login(user, pw):",
  "    query = f'SELECT * FROM users WHERE name={user}'",
  "    cursor.execute(query)",
  "    return cursor.fetchone()",
].join("\n")

function InteractiveArenaHarness({
  slug,
  onSubmit = vi.fn(),
}: {
  slug: string
  onSubmit?: () => void
}) {
  const lineSpace = React.useMemo(
    () => buildLineSpace({ code: SAMPLE_CODE }),
    []
  )
  const { draft, dispatch } = useReviewDraft(slug, lineSpace)
  const { layer, cursorApi, setEditingFindingId } = useDraftAnnotationLayer({
    draft,
    dispatch,
    lineSpace,
  })
  const [helpOpen, setHelpOpen] = React.useState(false)

  useReviewHotkeys({
    enabled: true,
    onAction: (action) => {
      switch (action) {
        case "cursorDown":
          cursorApi.move("down")
          return true
        case "cursorUp":
          cursorApi.move("up")
          return true
        case "toggleFlag": {
          const target = cursorApi.cursor ?? cursorApi.firstFlaggableLine()
          if (!target) return false
          layer.activate(target)
          return true
        }
        case "commentOrEdit": {
          const target = cursorApi.cursor ?? cursorApi.firstFlaggableLine()
          if (!target) return false
          const existing = findingAt(draft, target)
          if (existing) {
            setEditingFindingId(existing.id)
          } else {
            layer.activate(target)
          }
          return true
        }
        case "saveOrSubmit":
          onSubmit()
          return true
        case "toggleHelp":
          setHelpOpen((prev) => !prev)
          return true
        default:
          return false
      }
    },
  })

  return (
    <div>
      <AnnotationProvider layer={layer}>
        <CodeViewer
          code={SAMPLE_CODE}
          language="python"
          flaggedLines={[]}
          onToggleLine={() => {}}
        />
      </AnnotationProvider>
      <ShortcutOverlay open={helpOpen} onOpenChange={setHelpOpen} />
      <div data-testid="finding-count">{draft.findings.length}</div>
      <div data-testid="finding-summary">
        {draft.findings
          .map((f) => `${f.anchor.start}-${f.anchor.end}:${f.body}`)
          .join("|")}
      </div>
    </div>
  )
}

describe("Arena inline threads, range selection, and keyboard shortcuts", () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.clearAllMocks()
  })

  it("supports Shift+Click range flagging, inline comment save, and extend", async () => {
    const user = userEvent.setup()
    render(<InteractiveArenaHarness slug="range-test" />)

    const line2Btn = await screen.findByRole("button", { name: "Flag line 2" })
    await user.click(line2Btn)
    expect(screen.getByTestId("finding-count")).toHaveTextContent("1")

    const line3Btn = screen.getByRole("button", { name: "Flag line 3" })
    fireEvent.click(line3Btn, { shiftKey: true })
    expect(screen.getByTestId("finding-count")).toHaveTextContent("1")
    expect(screen.getByText("L2-L3")).toBeInTheDocument()

    const commentBox = screen.getByLabelText("Comment for L2-L3")
    await user.type(commentBox, "SQL injection via f-string")
    await user.click(screen.getByRole("button", { name: "Save" }))

    expect(screen.getByTestId("finding-summary")).toHaveTextContent(
      "2-3:SQL injection via f-string"
    )

    await user.click(screen.getByRole("button", { name: "Edit finding L2-L3" }))
    await user.click(screen.getByRole("button", { name: "Extend range down" }))
    expect(screen.getByText("L2-L4")).toBeInTheDocument()
  })

  it("supports j/k cursor, f flag, c inline comment, ? shortcut overlay, and Cmd+Enter submit", async () => {
    const onSubmit = vi.fn()
    render(<InteractiveArenaHarness slug="hotkey-test" onSubmit={onSubmit} />)
    await screen.findByTestId("code-viewer")

    fireEvent.keyDown(document.body, { key: "j" })
    fireEvent.keyDown(document.body, { key: "j" })
    fireEvent.keyDown(document.body, { key: "f" })
    expect(screen.getByTestId("finding-count")).toHaveTextContent("1")
    expect(screen.getByText("L2")).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: "c" })
    expect(screen.getByLabelText("Comment for L2")).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: "?" })
    expect(screen.getByTestId("shortcut-overlay")).toBeInTheDocument()
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: "Enter", metaKey: true })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it("renders TP, FN, and FP inline verdict cards in AnnotatedCodeTab", async () => {
    const response: ReviewSubmissionResponse = {
      submission_id: 9,
      id: 9,
      score: 50,
      feedback: "Partial catch",
      comments: "",
      created_at: "2026-11-21T00:00:00Z",
      detected_issues: [
        {
          id: "d1",
          title: "SQL Injection",
          severity: "critical",
          matched_lines: [2],
          finding_ids: ["f-hit"],
          explanation: "Use parameterized queries.",
        },
      ],
      missed_issues: [
        {
          id: "d2",
          title: "Missing cursor close",
          severity: "low",
          expected_lines: [3],
          explanation: "Close cursor in context manager.",
        },
      ],
      findings: [
        {
          id: asFindingId("f-hit"),
          file_path: null,
          start_line: 2,
          end_line: 2,
          body: "Unsanitized SQL",
          severity: "critical",
        },
        {
          id: asFindingId("f-fp"),
          file_path: null,
          start_line: 4,
          end_line: 4,
          body: "False alarm",
          severity: "low",
        },
      ],
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

    const solution: ChallengeSolutionResponse = {
      id: 1,
      challenge_id: 1,
      slug: "sqli",
      canonical_review: "Use parameters",
      recommended_fix_diff: "",
      expected_issues: [
        {
          id: "d1",
          title: "SQL Injection",
          severity: "critical",
          lines: [2],
          keywords: ["sql"],
          explanation: "Use parameterized queries.",
        },
        {
          id: "d2",
          title: "Missing cursor close",
          severity: "low",
          lines: [3],
          keywords: ["close"],
          explanation: "Close cursor in context manager.",
        },
      ],
    }

    const report = parseGradeReport(response)
    render(
      <AnnotatedCodeTab
        codeSnippet={SAMPLE_CODE}
        language="python"
        gradeReport={report}
        solution={solution}
      />
    )

    expect(await screen.findByTestId("annotated-code-tab")).toBeInTheDocument()
    expect(screen.getAllByText("Matched").length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText("Missed").length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText("False positive").length).toBeGreaterThanOrEqual(
      2
    )
    expect(screen.getByText("SQL Injection")).toBeInTheDocument()
    expect(screen.getByText("Missing cursor close")).toBeInTheDocument()
  })
})
