import * as React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CodeViewer } from "@/components/review/code-viewer"

describe("CodeViewer Component", () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  const samplePythonCode = `def add(a, b):
    # Potential defect here
    return a + b`

  it("renders code snippet, line numbers, and file metadata header", async () => {
    render(
      <CodeViewer
        code={samplePythonCode}
        language="python"
        flaggedLines={[]}
        onToggleLine={vi.fn()}
        fileName="calculator.py"
      />
    )

    expect(await screen.findByTestId("code-viewer")).toBeInTheDocument()
    expect(screen.getByText("calculator.py")).toBeInTheDocument()
    expect(screen.getByText(/python/i)).toBeInTheDocument()
    expect(screen.getByText("3 lines")).toBeInTheDocument()

    // Line number buttons
    expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "2" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "3" })).toBeInTheDocument()
  })

  it("normalizes language shortcuts and falls back to default file names", async () => {
    const { rerender } = render(
      <CodeViewer
        code={samplePythonCode}
        language="py"
        flaggedLines={[]}
        onToggleLine={vi.fn()}
      />
    )

    expect(await screen.findByText("solution.py")).toBeInTheDocument()
    expect(screen.getByText(/python/i)).toBeInTheDocument()

    rerender(
      <CodeViewer
        code="const x: number = 42;"
        language="typescript"
        flaggedLines={[]}
        onToggleLine={vi.fn()}
      />
    )

    expect(await screen.findByText("solution.ts")).toBeInTheDocument()
    expect(screen.getByText(/typescript/i)).toBeInTheDocument()
  })

  it("calls onToggleLine with the clicked line number", async () => {
    const onToggleLineMock = vi.fn()
    const user = userEvent.setup()

    render(
      <CodeViewer
        code={samplePythonCode}
        language="python"
        flaggedLines={[]}
        onToggleLine={onToggleLineMock}
      />
    )

    const line2Button = await screen.findByRole("button", { name: "2" })
    await user.click(line2Button)

    expect(onToggleLineMock).toHaveBeenCalledTimes(1)
    expect(onToggleLineMock).toHaveBeenCalledWith(2)
  })

  it("does not call onToggleLine when readOnly is true", async () => {
    const onToggleLineMock = vi.fn()
    const user = userEvent.setup()

    render(
      <CodeViewer
        code={samplePythonCode}
        language="python"
        flaggedLines={[]}
        onToggleLine={onToggleLineMock}
        readOnly={true}
      />
    )

    const line2Button = await screen.findByRole("button", { name: "2" })
    expect(line2Button).toBeDisabled()
    await user.click(line2Button)

    expect(onToggleLineMock).not.toHaveBeenCalled()
  })

  it("displays flagged indicators, flagged count badge, and styling", async () => {
    render(
      <CodeViewer
        code={samplePythonCode}
        language="python"
        flaggedLines={[2]}
        onToggleLine={vi.fn()}
      />
    )

    // Flagged count badge in file bar
    expect(await screen.findByText("1 flagged")).toBeInTheDocument()

    // Title on flagged line button
    const line2Button = screen.getByRole("button", { name: "2" })
    expect(line2Button).toHaveAttribute(
      "title",
      "Line 2 flagged. Click to unflag."
    )

    // Flag icon marker
    expect(screen.getByTitle("Flagged for review")).toBeInTheDocument()
  })

  it("copies code to clipboard when copy button is clicked", async () => {
    const writeTextSpy = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <CodeViewer
        code={samplePythonCode}
        language="python"
        flaggedLines={[]}
        onToggleLine={vi.fn()}
      />
    )

    const copyButton = await screen.findByRole("button", { name: /copy/i })
    fireEvent.click(copyButton)

    expect(writeTextSpy).toHaveBeenCalledTimes(1)
    expect(writeTextSpy).toHaveBeenCalledWith(samplePythonCode)
    expect(await screen.findByText("Copied")).toBeInTheDocument()
  })

  it("renders How to flag guide button and triggers onOpenGuide callback", async () => {
    const onOpenGuideMock = vi.fn()
    const user = userEvent.setup()

    render(
      <CodeViewer
        code={samplePythonCode}
        language="python"
        flaggedLines={[]}
        onToggleLine={vi.fn()}
        onOpenGuide={onOpenGuideMock}
      />
    )

    const guideButton = await screen.findByTestId("how-to-flag-guide-button")
    expect(guideButton).toBeInTheDocument()
    await user.click(guideButton)

    expect(onOpenGuideMock).toHaveBeenCalledTimes(1)
  })

  it("calls onToggleLine when clicking the gutter flag button on unflagged and flagged lines", async () => {
    const onToggleLineMock = vi.fn()
    const user = userEvent.setup()

    const { rerender } = render(
      <CodeViewer
        code={samplePythonCode}
        language="python"
        flaggedLines={[]}
        onToggleLine={onToggleLineMock}
      />
    )

    // Click unflagged gutter flag button for line 2
    const flagButton = screen.getByRole("button", { name: "Flag line 2" })
    await user.click(flagButton)
    expect(onToggleLineMock).toHaveBeenCalledWith(2)

    // Rerender as flagged and click unflag button
    rerender(
      <CodeViewer
        code={samplePythonCode}
        language="python"
        flaggedLines={[2]}
        onToggleLine={onToggleLineMock}
      />
    )

    const unflagButton = screen.getByRole("button", { name: "Unflag line 2" })
    await user.click(unflagButton)
    expect(onToggleLineMock).toHaveBeenCalledWith(2)
  })
})
