import * as React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ThemeProvider } from "@/components/theme-provider"

const mockSetTheme = vi.fn()
let mockResolvedTheme: string | undefined = "dark"

vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useTheme: () => ({
    resolvedTheme: mockResolvedTheme,
    setTheme: mockSetTheme,
  }),
}))

describe("ThemeProvider", () => {
  beforeEach(() => {
    mockResolvedTheme = "dark"
    mockSetTheme.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("ignores synthetic keydown events without a key property on inputs and window", () => {
    render(
      <ThemeProvider>
        <input aria-label="Email" />
      </ThemeProvider>
    )

    const input = screen.getByLabelText("Email")
    const uncaughtErrors: unknown[] = []
    const onWindowError = (event: ErrorEvent) => {
      event.preventDefault()
      uncaughtErrors.push(event.error ?? new Error(event.message))
    }

    window.addEventListener("error", onWindowError)

    try {
      input.dispatchEvent(new Event("keydown", { bubbles: true }))
      window.dispatchEvent(new Event("keydown", { bubbles: true }))
    } finally {
      window.removeEventListener("error", onWindowError)
    }

    expect(uncaughtErrors).toEqual([])
    expect(mockSetTheme).not.toHaveBeenCalled()
  })

  it("toggles between dark and light on lowercase and uppercase D outside typing targets", () => {
    mockResolvedTheme = "dark"
    const { rerender } = render(
      <ThemeProvider>
        <button type="button">Focus target</button>
      </ThemeProvider>
    )

    const button = screen.getByRole("button", { name: "Focus target" })

    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "d", bubbles: true })
    )
    expect(mockSetTheme).toHaveBeenCalledWith("light")

    mockSetTheme.mockClear()
    mockResolvedTheme = "light"
    rerender(
      <ThemeProvider>
        <button type="button">Focus target</button>
      </ThemeProvider>
    )

    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "D", bubbles: true })
    )
    expect(mockSetTheme).toHaveBeenCalledWith("dark")
  })

  it("does not toggle theme when typing in an input or when modifier keys are pressed", () => {
    render(
      <ThemeProvider>
        <input aria-label="Username" />
        <button type="button">Action</button>
      </ThemeProvider>
    )

    const input = screen.getByLabelText("Username")
    const button = screen.getByRole("button", { name: "Action" })

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "d", bubbles: true })
    )
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "d", ctrlKey: true, bubbles: true })
    )
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "d", metaKey: true, bubbles: true })
    )
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "d", altKey: true, bubbles: true })
    )

    expect(mockSetTheme).not.toHaveBeenCalled()
  })
})
