import * as React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  FlaggingGuideModal,
  FLAGGING_GUIDE_STORAGE_KEY,
} from "@/components/review/flagging-guide-modal"
import { useArenaUIStore } from "@/stores/arena-ui-store"

describe("FlaggingGuideModal Component", () => {
  beforeEach(() => {
    window.localStorage.clear()
    useArenaUIStore.getState().resetArenaUI()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it("renders modal with title, description, and 3-step guide when open", () => {
    render(<FlaggingGuideModal open={true} onOpenChange={vi.fn()} />)

    expect(screen.getByTestId("flagging-guide-modal")).toBeInTheDocument()
    expect(screen.getByText("How to Flag Code Defects")).toBeInTheDocument()
    expect(
      screen.getByText(/Spot bugs or security flaws in the snippet/i)
    ).toBeInTheDocument()

    // 3 steps
    expect(screen.getByText("Hover Any Line")).toBeInTheDocument()
    expect(screen.getByText("Click to Flag")).toBeInTheDocument()
    expect(screen.getByText(/Explain & Submit/i)).toBeInTheDocument()
  })

  it("renders interactive code demo placeholder and allows clicking line numbers", async () => {
    const user = userEvent.setup()
    render(<FlaggingGuideModal open={true} onOpenChange={vi.fn()} />)

    expect(screen.getByTestId("flagging-guide-demo")).toBeInTheDocument()
    expect(screen.getByText("auth_service.py")).toBeInTheDocument()
    expect(screen.getByText("Interactive Demo")).toBeInTheDocument()

    // Line 4 is pre-flagged in demo
    expect(screen.getByText("L4")).toBeInTheDocument()

    // Toggle line 1 in demo
    const line1Button = screen.getByRole("button", {
      name: "Demo toggle line 1",
    })
    await user.click(line1Button)

    // Now both L1 and L4 should be flagged
    expect(screen.getByText("L1")).toBeInTheDocument()
    expect(screen.getByText("L4")).toBeInTheDocument()

    // Reset demo
    const resetButton = screen.getByRole("button", { name: /reset demo/i })
    await user.click(resetButton)
    expect(screen.getByText("None selected")).toBeInTheDocument()
  })

  it("calls onOpenChange(false) when clicking 'Got it, start reviewing'", async () => {
    const onOpenChangeMock = vi.fn()
    const user = userEvent.setup()

    render(<FlaggingGuideModal open={true} onOpenChange={onOpenChangeMock} />)

    const closeButton = screen.getByTestId("close-guide-button")
    await user.click(closeButton)

    expect(onOpenChangeMock).toHaveBeenCalledWith(false)
  })

  it("persists don't show again preference to localStorage when checkbox is toggled", async () => {
    const user = userEvent.setup()
    render(<FlaggingGuideModal open={true} onOpenChange={vi.fn()} />)

    const checkbox = screen.getByTestId("dont-show-guide-checkbox")
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)
    expect(checkbox).toBeChecked()
    expect(window.localStorage.getItem(FLAGGING_GUIDE_STORAGE_KEY)).toBe("true")

    await user.click(checkbox)
    expect(checkbox).not.toBeChecked()
    expect(window.localStorage.getItem(FLAGGING_GUIDE_STORAGE_KEY)).toBeNull()
  })

  it("reads from useArenaUIStore when uncontrolled", () => {
    useArenaUIStore.getState().setIsFlagGuideOpen(true)
    render(<FlaggingGuideModal />)

    expect(screen.getByTestId("flagging-guide-modal")).toBeInTheDocument()
  })
})
