import * as React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { CodeDiffViewer } from "@/components/review/comparison/code-diff-viewer"
import { FormattedInlineText } from "@/components/review/formatted-inline"
import {
  parseInlineTokens,
  parseMarkdownBlocks,
} from "@/components/review/markdown-parser"

describe("Unified Markdown & Inline Parser", () => {
  afterEach(() => {
    cleanup()
  })

  it("parses safe links and nested inline formatting", () => {
    render(
      <FormattedInlineText text="See [**docs** with `eval`](https://example.com) and ~~old~~" />
    )

    const link = screen.getByRole("link")
    expect(link).toHaveTextContent("docs with eval")
    expect(link).toHaveAttribute("href", "https://example.com")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
    expect(screen.getByText("docs").tagName).toBe("STRONG")
    expect(screen.getByText("eval").tagName).toBe("CODE")
    expect(screen.getByText("old").tagName).toBe("DEL")
  })

  it("rejects unsafe javascript: links", () => {
    const tokens = parseInlineTokens(
      "[click](javascript:alert(1))",
      "unsafe-test"
    )
    expect(tokens.some((t) => t.type === "link")).toBe(false)
  })

  it("terminates on incomplete streaming headings, unspaced hashes, and h5/h6 headings", () => {
    for (const input of [
      "#",
      "##",
      "###",
      "####",
      "#no-space",
      "Intro line\n###",
    ]) {
      const blocks = parseMarkdownBlocks(input)
      expect(blocks.length).toBeGreaterThan(0)
      expect(blocks[0].type).toBe("paragraph")
    }

    const deepHeadings = parseMarkdownBlocks("##### Deep\n###### Deeper")
    expect(deepHeadings).toHaveLength(2)
    expect(deepHeadings[0]).toMatchObject({ type: "heading", level: 4 })
    expect(deepHeadings[1]).toMatchObject({ type: "heading", level: 4 })
  })
})

describe("CodeDiffViewer", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders theme-aware tokens and responsive split grid without bg-zinc-950", () => {
    const rawDiff = [
      "--- a/app.py",
      "+++ b/app.py",
      "@@ -1,2 +1,2 @@",
      "-eval(user_input)",
      "+ast.literal_eval(user_input)",
    ].join("\n")

    render(<CodeDiffViewer rawDiff={rawDiff} language="python" />)
    const viewer = screen.getByTestId("code-diff-viewer")
    expect(viewer.innerHTML).not.toContain("bg-zinc-950")
    expect(viewer.innerHTML).toContain("md:grid-cols-2")
  })
})
