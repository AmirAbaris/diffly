import * as React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SandboxDiffRow } from "@/components/landing/sandbox-diff-row"
import { NavStats } from "@/components/layout/nav-stats"
import { fetchCurrentUser, setStoredAuthUser } from "@/lib/auth"
import { apiClient } from "@/lib/axios"

vi.mock("@/lib/axios", () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

describe("Lighthouse Accessibility & Best Practices Improvements", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("renders diff row line numbers and prefixes with WCAG AA compliant contrast classes", () => {
    const mockLine = {
      lineNumber: 1,
      oldLineNumber: 42,
      newLineNumber: 42,
      kind: "context" as const,
      content: "const a = 1",
    }

    render(
      <SandboxDiffRow line={mockLine} isFlagged={false} onRowClick={vi.fn()} />
    )

    const rowButton = screen.getByTestId("sandbox-diff-line-1")
    const spans = rowButton.querySelectorAll("span")

    // Old line number span
    expect(spans[0]).toHaveClass("text-zinc-600")
    expect(spans[0]).toHaveClass("dark:text-zinc-400")

    // New line number span
    expect(spans[1]).toHaveClass("text-zinc-600")
    expect(spans[1]).toHaveClass("dark:text-zinc-400")

    // Prefix span
    expect(spans[2]?.querySelector("span")).toHaveClass("text-zinc-600")
    expect(spans[2]?.querySelector("span")).toHaveClass("dark:text-zinc-400")
  })

  it("includes visible stats text in nav-stats trigger accessible name for WCAG 2.5.3 Label in Name compliance", () => {
    render(<NavStats />)

    const trigger = screen.getByTestId("nav-stats-trigger")
    const accessibleLabel = trigger.getAttribute("aria-label") ?? ""

    expect(accessibleLabel).toContain("Solved")
    expect(accessibleLabel).toContain("Accuracy")
    expect(accessibleLabel).toContain("Streak")
    expect(trigger).toHaveAttribute(
      "title",
      "View performance metrics and category mastery"
    )
  })

  it("fetchCurrentUser queries /api/auth/me even when localStorage is empty and returns null on 401", async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce({
      response: { status: 401 },
    })

    const user = await fetchCurrentUser()

    expect(apiClient.get).toHaveBeenCalledWith("/api/auth/me")
    expect(user).toBeNull()
  })

  it("fetchCurrentUser hydrates localStorage from /api/auth/me when cookie session exists without stored user", async () => {
    const serverUser = {
      id: 456,
      username: "cookieuser",
      email: "cookie@example.com",
    }

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: serverUser,
    })

    const user = await fetchCurrentUser()

    expect(apiClient.get).toHaveBeenCalledWith("/api/auth/me")
    expect(user).toEqual(serverUser)
    expect(
      JSON.parse(localStorage.getItem("diffly_auth_user") ?? "null")
    ).toEqual(serverUser)
  })

  it("fetchCurrentUser revalidates with server when a stored user session exists in localStorage", async () => {
    const storedUser = {
      id: 123,
      username: "audituser",
      email: "audit@example.com",
    }
    setStoredAuthUser(storedUser)

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        id: 123,
        username: "audituser",
        email: "audit@example.com",
      },
    })

    const user = await fetchCurrentUser()

    expect(apiClient.get).toHaveBeenCalledWith("/api/auth/me")
    expect(user).toEqual(storedUser)
  })
})
