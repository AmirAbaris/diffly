import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resolveChallengeMetadata } from "@/lib/server/challenge-metadata"

const mockCookiesGetAll = vi.fn()

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => mockCookiesGetAll(),
  }),
}))

describe("resolveChallengeMetadata", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    mockCookiesGetAll.mockReset()
    mockCookiesGetAll.mockReturnValue([])
    process.env = { ...originalEnv, BACKEND_URL: "http://127.0.0.1:8000" }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("reads real challenge title and description from backend API and forwards only auth/guest cookies", async () => {
    mockCookiesGetAll.mockReturnValue([
      { name: "diffly_access_token", value: "jwt-token" },
      { name: "diffly_guest_session", value: "injected; evil=1" },
      { name: "unrelated_cookie", value: "should-not-forward" },
    ])

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        title: "FastAPI Raw SQL Query String Interpolation",
        description: "Find the **SQL injection** flaw in `query`.",
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const meta = await resolveChallengeMetadata(
      "fastapi-raw-sql-injection",
      "tok_123"
    )

    expect(meta.title).toBe(
      "FastAPI Raw SQL Query String Interpolation - Arena"
    )
    expect(meta.description).toContain("SQL injection")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(calledUrl).toBe(
      "http://127.0.0.1:8000/api/challenges/fastapi-raw-sql-injection?share_token=tok_123"
    )
    expect(calledInit.cache).toBe("no-store")
    expect(calledInit.redirect).toBe("manual")
    expect(calledInit.headers).toEqual({
      Cookie: "diffly_access_token=jwt-token",
    })
    expect(meta.robots).toEqual({ index: false, follow: false })
    expect(meta.referrer).toBe("no-referrer")
  })

  it("does not leak private challenges when backend responds 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
    )

    const meta = await resolveChallengeMetadata("secret-private-slug")
    expect(meta.title).toBe("Secret Private Slug - Arena")
  })

  it("falls back to curated bundle meta.yaml when backend is unreachable and folds multi-line defect_target", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"))
    )

    const meta = await resolveChallengeMetadata("agent-unsanitized-exec")
    expect(meta.title).toBe(
      "Unsanitized Autonomous Calculator Tool Execution - Arena"
    )
    expect(meta.description).toContain("RCE")

    const foldedMeta = await resolveChallengeMetadata(
      "agent-prompt-injection-leak"
    )
    expect(foldedMeta.title).toContain("Prompt Injection")
    expect(foldedMeta.description.length).toBeGreaterThan(60)
  })

  it("rejects path traversal and reserved slugs before calling fetch", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const traversalMeta = await resolveChallengeMetadata("../../package")
    expect(traversalMeta.title).toBe("../../package - Arena")

    const reservedMeta = await resolveChallengeMetadata("custom")
    expect(reservedMeta.title).toBe("Custom - Arena")

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
