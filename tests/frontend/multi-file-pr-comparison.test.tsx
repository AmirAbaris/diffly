import * as React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CodeDiffViewer } from "@/components/review/comparison/code-diff-viewer"
import { parseMultiFileUnifiedDiff } from "@/components/review/comparison/diff-parser"
import { StaffReviewColumn } from "@/components/review/comparison/staff-review-column"
import { UserReviewColumn } from "@/components/review/comparison/user-review-column"
import { HistoryDetail } from "@/components/review/history/history-detail"
import { ReviewCommentEditor } from "@/components/review/review-comment-editor"
import { ReviewResultModal } from "@/components/review/review-result-modal"
import type {
  FlaggedLine,
  ReviewSubmissionResponse,
  SubmissionHistoryItem,
} from "@/types/challenge"

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/challenges/pr-oauth-session-csrf-bypass",
}))

describe("Multi-File PR Comparison & Scoped Reporting", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("renders file-scoped lines cleanly in editor, result modal, comparison, and history without object coercion", async () => {
    const user = userEvent.setup()
    const onToggleLine = vi.fn()
    const scopedLines: FlaggedLine[] = [
      { file_path: "api/routes/oauth.py", line_number: 19 },
      { file_path: "backend/core/cookies.py", line_number: 14 },
    ]

    const result: ReviewSubmissionResponse = {
      id: 55,
      submission_id: 55,
      score: 90,
      feedback: "Good multi-file catch",
      flagged_lines: scopedLines,
      comments: "CSRF state bypass and insecure cookie.",
      detected_issues: [
        {
          id: "csrf",
          title: "Missing OAuth State Check",
          severity: "high",
          matched_lines: [
            { file_path: "api/routes/oauth.py", line_number: 19 },
          ],
        },
      ],
      missed_issues: [
        {
          id: "cookie",
          title: "HttpOnly Disabled",
          severity: "high",
          expected_lines: [
            { file_path: "backend/core/cookies.py", line_number: 14 },
          ],
        },
      ],
      created_at: "2026-11-20T00:00:00Z",
    }

    const historyItem: SubmissionHistoryItem = {
      attempt_number: 1,
      id: 55,
      submission_id: 55,
      challenge_id: 31,
      flagged_lines: scopedLines,
      comments: "CSRF state bypass.",
      score: 90,
      feedback: "Good",
      detected_issues: result.detected_issues,
      missed_issues: [],
      created_at: "2026-11-20T00:00:00Z",
    }

    const { unmount: unmountEditor } = render(
      <ReviewCommentEditor
        flaggedLines={scopedLines}
        onToggleLine={onToggleLine}
        comment="Detailed multi-file security critique."
        onChangeComment={vi.fn()}
        onSubmitReview={vi.fn()}
      />
    )

    expect(screen.getByText("oauth.py:L19")).toBeInTheDocument()
    expect(screen.getByText("cookies.py:L14")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "Unflag api/routes/oauth.py:19" })
    )
    expect(onToggleLine).toHaveBeenCalledWith({
      file_path: "api/routes/oauth.py",
      line_number: 19,
    })
    unmountEditor()

    render(
      <div>
        <ReviewResultModal
          open={true}
          onOpenChange={vi.fn()}
          result={result}
          challengeSlug="pr-oauth-session-csrf-bypass"
        />
        <UserReviewColumn flaggedLines={scopedLines} comments="Test comment" />
        <StaffReviewColumn
          solution={{
            id: 1,
            challenge_id: 31,
            slug: "pr-oauth-session-csrf-bypass",
            canonical_review: "Fix both files.",
            recommended_fix_diff: "",
            expected_issues: [
              {
                id: "csrf",
                title: "Missing OAuth State Check",
                severity: "high",
                lines: [{ file_path: "api/routes/oauth.py", line_number: 19 }],
                keywords: ["csrf"],
                explanation: "Verify state.",
              },
            ],
          }}
          onOpenDiff={vi.fn()}
        />
        <HistoryDetail item={historyItem} />
      </div>
    )

    expect(document.body.textContent).not.toContain("[object Object]")
    expect(
      screen.getAllByText(/api\/routes\/oauth\.py:19/).length
    ).toBeGreaterThanOrEqual(2)
    expect(
      screen.getAllByText(/backend\/core\/cookies\.py:14/).length
    ).toBeGreaterThanOrEqual(2)
  })

  it("parses and switches multi-file recommended_fix_diff in CodeDiffViewer", async () => {
    const user = userEvent.setup()
    const multiDiff = [
      "--- a/api/routes/oauth.py",
      "+++ b/api/routes/oauth.py",
      "@@ -19,2 +19,1 @@",
      "-    if not state:",
      "+    if not hmac.compare_digest(expected, state):",
      "--- a/backend/core/cookies.py",
      "+++ b/backend/core/cookies.py",
      "@@ -14,1 +14,1 @@",
      "-    httponly=False,",
      "+    httponly=True,",
    ].join("\n")

    const parsed = parseMultiFileUnifiedDiff(multiDiff, "python")
    expect(parsed).toHaveLength(2)
    expect(parsed[0].filePath).toBe("api/routes/oauth.py")
    expect(parsed[1].filePath).toBe("backend/core/cookies.py")

    const { container } = render(
      <CodeDiffViewer rawDiff={multiDiff} language="python" />
    )

    const tabsContainer = screen.getByTestId("comparison-diff-file-tabs")
    expect(tabsContainer).toBeInTheDocument()
    expect(container.textContent).toContain("hmac.compare_digest")

    await user.click(
      screen.getByRole("tab", { name: /backend\/core\/cookies\.py/ })
    )
    expect(container.textContent).toContain("httponly=True")
  })
})
