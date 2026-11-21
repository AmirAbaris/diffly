import * as React from "react"
import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CodeViewer } from "@/components/review/code-viewer"
import { buildPrFileSummaries } from "@/components/review/code-viewer/pr-file-utils"
import { parseUnifiedDiff } from "@/components/review/comparison/diff-parser"
import {
  buildUnboundedLineSpace,
  expandFlaggedLines,
  toLineRef,
} from "@/lib/review"
import { useReviewDraftStore } from "@/stores/review-draft-store"
import type { ChallengeFile, FlaggedLine } from "@/types/challenge"

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/challenges/pr-oauth-session-csrf-bypass",
}))

const PR_FILES: ChallengeFile[] = [
  {
    path: "api/routes/oauth.py",
    language: "python",
    patch: [
      "--- a/api/routes/oauth.py",
      "+++ b/api/routes/oauth.py",
      "@@ -16,4 +16,5 @@ def oauth_callback(code: str, state: str):",
      "     expected = cookies.get('oauth_state')",
      "-    if expected != state:",
      "-        raise ValueError('bad state')",
      "+    if not state:",
      "+        raise ValueError('missing state')",
      "+    logger.info('ok')",
    ].join("\n"),
  },
  {
    path: "backend/core/cookies.py",
    language: "python",
    patch: [
      "--- a/backend/core/cookies.py",
      "+++ b/backend/core/cookies.py",
      "@@ -10,3 +10,3 @@ def set_auth(res, token):",
      "-    res.set_cookie('sid', token, httponly=True)",
      "+    res.set_cookie('sid', token, httponly=False)",
      "     return res",
    ].join("\n"),
  },
  {
    path: "config/settings.py",
    language: "python",
    content: "OAUTH_ENABLED = True\nCOOKIE_MAX_AGE = 3600",
  },
]

describe("Multi-file PR Diff Mode", () => {
  beforeEach(() => {
    window.localStorage.clear()
    useReviewDraftStore.setState({ drafts: {} })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("renders PR file tree, switches files, toggles unified/split diff, and flags scoped lines", async () => {
    const user = userEvent.setup()
    const flagged: FlaggedLine[] = [
      { file_path: "api/routes/oauth.py", line_number: 18 },
    ]
    const onToggleLine = vi.fn()

    render(
      <CodeViewer
        files={PR_FILES}
        language="python"
        flaggedLines={flagged}
        onToggleLine={onToggleLine}
      />
    )

    // PR file switcher & tree visible with 3 files
    expect(screen.getByTestId("pr-file-switcher")).toBeInTheDocument()
    expect(screen.getByText("Files changed (3)")).toBeInTheDocument()
    expect(screen.getByTestId("pr-file-tree")).toBeInTheDocument()

    // Unified view active by default with hunk header & +/- markers
    expect(screen.getByTestId("code-viewer-unified")).toBeInTheDocument()
    expect(screen.getByTestId("diff-hunk-header")).toHaveTextContent(
      "@@ -16,4 +16,5 @@"
    )

    // Flagging line 19 in active file emits file-scoped reference
    await user.click(screen.getByRole("button", { name: "Flag line 19" }))
    expect(onToggleLine).toHaveBeenCalledWith({
      file_path: "api/routes/oauth.py",
      line_number: 19,
    })

    // Toggle to Split diff view
    await user.click(screen.getByTestId("code-diff-mode-split"))
    expect(screen.getByTestId("code-viewer-split")).toBeInTheDocument()
    expect(screen.getByText("Original")).toBeInTheDocument()
    expect(screen.getByText("Modified")).toBeInTheDocument()

    // Switch to second patch file via tree item
    await user.click(
      screen.getByTestId("pr-file-tree-item-backend/core/cookies.py")
    )
    expect(screen.getByRole("button", { name: "Flag line 10" })).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Flag line 10" }))
    expect(onToggleLine).toHaveBeenCalledWith({
      file_path: "backend/core/cookies.py",
      line_number: 10,
    })

    // Switch to full-content file (no patch -> hides Unified/Split toggle, renders lines 1..2)
    await user.click(screen.getByTestId("pr-file-tab-config/settings.py"))
    expect(screen.queryByTestId("code-diff-mode-split")).not.toBeInTheDocument()
    expect(screen.getByText(/OAUTH_ENABLED/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Flag line 2" }))
    expect(onToggleLine).toHaveBeenCalledWith({
      file_path: "config/settings.py",
      line_number: 2,
    })

    // Collapse & expand PR tree
    await user.click(screen.getByTestId("pr-file-tree-toggle"))
    expect(screen.queryByTestId("pr-file-tree")).not.toBeInTheDocument()
  })

  it("persists and restores file-scoped FlaggedLineRef items in review draft store", () => {
    const store = useReviewDraftStore.getState()
    const space = buildUnboundedLineSpace()
    act(() => {
      store.hydrate("pr-slug")
      store.dispatch(
        "pr-slug",
        {
          type: "toggle",
          at: toLineRef({
            file_path: "api/routes/oauth.py",
            line_number: 19,
          }),
        },
        space
      )
      store.dispatch(
        "pr-slug",
        {
          type: "toggle",
          at: toLineRef({
            file_path: "backend/core/cookies.py",
            line_number: 10,
          }),
        },
        space
      )
    })

    expect(
      expandFlaggedLines(useReviewDraftStore.getState().drafts["pr-slug"].draft)
    ).toEqual([
      { file_path: "api/routes/oauth.py", line_number: 19 },
      { file_path: "backend/core/cookies.py", line_number: 10 },
    ])

    // Toggle existing line off
    act(() => {
      store.dispatch(
        "pr-slug",
        {
          type: "toggle",
          at: toLineRef({
            file_path: "api/routes/oauth.py",
            line_number: 19,
          }),
        },
        space
      )
    })
    expect(
      expandFlaggedLines(useReviewDraftStore.getState().drafts["pr-slug"].draft)
    ).toEqual([{ file_path: "backend/core/cookies.py", line_number: 10 }])

    // Rehydrate fresh store instance from localStorage
    useReviewDraftStore.setState({ drafts: {} })
    act(() => {
      useReviewDraftStore.getState().hydrate("pr-slug")
    })
    expect(
      expandFlaggedLines(useReviewDraftStore.getState().drafts["pr-slug"].draft)
    ).toEqual([{ file_path: "backend/core/cookies.py", line_number: 10 }])
  })

  it("handles trailing newlines, CRLF/pre-hunk diff lines, and overlapping old/new flags accurately", async () => {
    const user = userEvent.setup()
    const files: ChallengeFile[] = [
      {
        path: "backend/core/cookies.py",
        language: "python",
        patch: [
          "@@ -14,2 +14,2 @@",
          "-    httponly=False,",
          "+    httponly=True,",
          "     secure=True,",
        ].join("\n"),
      },
      {
        path: "db/schema.sql",
        language: "sql",
        content: "SELECT 1;\nSELECT 2;\n",
      },
    ]

    // Trailing newline in content does not create a phantom 3rd line
    const summaries = buildPrFileSummaries(files, [])
    expect(summaries[1].lineCount).toBe(2)

    // Pre-hunk blank lines and CRLF endings do not emit line 0 context rows
    const crlfWithPreHunk =
      "diff --git a/x.py b/x.py\r\n\r\n--- a/x.py\r\n+++ b/x.py\r\n@@ -5,1 +5,1 @@\r\n-old\r\n+new\r\n"
    const parsedCrlf = parseUnifiedDiff(crlfWithPreHunk)
    expect(
      parsedCrlf.some(
        (line) => line.oldLineNumber === 0 || line.newLineNumber === 0
      )
    ).toBe(false)

    // Overlapping old/new line 14 highlights ONLY the new (+) row, not the deleted (-) row
    const { container } = render(
      <CodeViewer
        code=""
        files={files}
        flaggedLines={[
          { file_path: "backend/core/cookies.py", line_number: 14 },
        ]}
        onToggleLine={vi.fn()}
      />
    )
    expect(
      screen.getAllByRole("button", { name: "Unflag line 14" })
    ).toHaveLength(1)
    expect(
      Array.from(container.querySelectorAll("tr")).filter((tr) =>
        tr.className.includes("bg-amber-500/15")
      )
    ).toHaveLength(1)

    await user.click(screen.getByTestId("code-diff-mode-split"))
    expect(
      screen.getAllByRole("button", { name: "Unflag line 14" })
    ).toHaveLength(1)
    expect(
      Array.from(container.querySelectorAll("td")).filter((td) =>
        td.className.includes("bg-amber-500/15")
      )
    ).toHaveLength(3)

    // Switch to SQL content file: shows SQL badge and exactly 2 selectable lines
    await user.click(screen.getByTestId("pr-file-tab-db/schema.sql"))
    expect(screen.getByText(/^sql$/i)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Flag line 2" })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Flag line 3" })
    ).not.toBeInTheDocument()
  })
})
