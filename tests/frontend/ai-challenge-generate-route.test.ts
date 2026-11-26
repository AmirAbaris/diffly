import { NoObjectGeneratedError } from "ai"
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockGenerateText = vi.hoisted(() => vi.fn())
const mockFetch = vi.hoisted(() => vi.fn())

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>()
  return { ...actual, generateText: mockGenerateText }
})

import { POST } from "@/app/api/ai/challenges/generate/route"
import {
  buildChallengeGenerationPrompt,
  type GeneratedChallenge,
  GeneratedChallengeSchema,
  parseGenerateChallengePayload,
} from "@/lib/ai/challenge-generation"
import { BYOK_COOKIE_NAME, sealAICredential } from "@/lib/ai/cookie"
import {
  propagateBackendSetCookies,
  resolveInternalBackendOrigin,
} from "@/lib/server/backend-client"

const GENERATED_OUTPUT: GeneratedChallenge = {
  slug: "order-lookup-service",
  title: "Order Lookup Service",
  difficulty: "Medium",
  category: "Security",
  language: "python",
  description: "Review the order lookup handler for security defects.",
  threat_model: "Attackers can extract arbitrary rows via crafted order_id.",
  defect_target: "Identify 1 High-Severity SQL injection defect.",
  code_snippet:
    'def get_order(cursor, order_id: str):\n    query = f"SELECT * FROM orders WHERE id = {order_id}"\n    cursor.execute(query)\n    return cursor.fetchone()',
  expected_issues: [
    {
      id: "sql-injection",
      title: "SQL Injection via f-string",
      severity: "high",
      anchor_lines: ['query = f"SELECT * FROM orders WHERE id = {order_id}"'],
      matched_lines: [2],
      matched_keywords: ["sql injection", "parameterized", "interpolation"],
      explanation: "User input is interpolated directly into SQL.",
    },
  ],
  hints: [
    { tier: 1, label: "Contextual Clue", text: "Inspect query construction." },
    { tier: 2, label: "Vulnerability Class", text: "Check SQL interpolation." },
    { tier: 3, label: "Line Pointer", text: "Check line 2." },
  ],
  canonical_review: "Use parameterized queries instead of f-strings.",
  recommended_fix_diff:
    '--- a/orders.py\n+++ b/orders.py\n@@ -1,4 +1,4 @@\n def get_order(cursor, order_id: str):\n-    query = f"SELECT * FROM orders WHERE id = {order_id}"\n-    cursor.execute(query)\n+    cursor.execute("SELECT * FROM orders WHERE id = %s", (order_id,))\n     return cursor.fetchone()',
}

const jsonRes = (
  data: unknown,
  status = 200,
  initHeaders: HeadersInit = {}
) => {
  const headers = new Headers(initHeaders)
  headers.set("content-type", "application/json")
  return new Response(JSON.stringify(data), { status, headers })
}

const quotaRes = (total = 0, limit = 5, headers: HeadersInit = {}) =>
  jsonRes(
    { items: [], total, quota_limit: limit, quota_remaining: limit - total },
    200,
    headers
  )

const sealCookie = (
  provider: "google" | "openai" | "anthropic" = "openai",
  apiKey = "sk-test-secret-1234"
) =>
  `${BYOK_COOKIE_NAME}=${sealAICredential({ provider, model: "test-model", apiKey })}`

const postJson = (
  opts: {
    body?: unknown
    rawBody?: string
    headers?: Record<string, string>
  } = {}
) => {
  const defaultBody = {
    topic: "SQL injection in order lookup",
    language: "python",
    difficulty: "Medium",
  }
  return POST(
    new NextRequest("http://localhost:3000/api/ai/challenges/generate", {
      method: "POST",
      headers: { "content-type": "application/json", ...opts.headers },
      body: opts.rawBody ?? JSON.stringify(opts.body ?? defaultBody),
    })
  )
}

async function expectError(res: Response, status: number, message?: string) {
  expect(res.status).toBe(status)
  expect(res.headers.get("cache-control")).toBe("no-store")
  expect(res.headers.get("vary")).toBe("Cookie")
  const body = (await res.json()) as Record<string, unknown>
  expect(body.detail).toBe(body.error)
  if (message) expect(body.error).toBe(message)
  return body
}

describe("app/api/ai/challenges/generate/route", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch)
    vi.stubEnv("BACKEND_URL", "http://127.0.0.1:8000")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    mockGenerateText.mockReset()
    mockFetch.mockReset()
  })

  it("parses generation payloads, prompt keys, and strict schema without minLength", () => {
    expect(
      parseGenerateChallengePayload({ topic: "  Race condition in cache  " })
    ).toEqual({
      ok: true,
      value: {
        topic: "Race condition in cache",
        language: "python",
        difficulty: "Medium",
      },
    })
    for (const invalid of [
      { topic: "ab" },
      { topic: "x".repeat(201) },
      { topic: "Valid", language: "ruby" },
      { topic: "Valid", difficulty: "Extreme" },
    ]) {
      expect(parseGenerateChallengePayload(invalid).ok).toBe(false)
    }

    const prompt = buildChallengeGenerationPrompt({
      topic: "JWT verification bypass",
      language: "typescript",
      difficulty: "Hard",
    })
    expect(prompt).toContain("JSON")
    for (const key of Object.keys(GENERATED_OUTPUT)) {
      expect(prompt).toContain(key)
    }
    const emptyCheck = GeneratedChallengeSchema.safeParse({
      ...GENERATED_OUTPUT,
      code_snippet: "",
      expected_issues: [],
    })
    expect(emptyCheck.success).toBe(true)
  })

  it("rejects cross-site, non-JSON, malformed JSON, invalid payload, and missing/bad BYOK cookies", async () => {
    const evilOrigin = { origin: "https://evil.example.com" }
    const crossSite = { "sec-fetch-site": "cross-site" }
    const plainText = { "content-type": "text/plain" }
    const badCookie = { cookie: `${BYOK_COOKIE_NAME}=v1.tampered.val.x` }
    await expectError(await postJson({ headers: evilOrigin }), 403)
    await expectError(await postJson({ headers: crossSite }), 403)
    await expectError(await postJson({ headers: plainText, rawBody: "x" }), 415)
    await expectError(await postJson({ rawBody: "{not-json" }), 400)
    await expectError(await postJson({ body: { topic: "ab" } }), 400)
    await expectError(await postJson(), 401)
    await expectError(await postJson({ headers: badCookie }), 401)
    expect(mockGenerateText).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("checks production secret config and pre-flight quota before calling LLM", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("BYOK_COOKIE_SECRET", "")
    await expectError(
      await postJson({ headers: { cookie: `${BYOK_COOKIE_NAME}=v1.a.b.c` } }),
      500,
      "AI connection service is not configured."
    )
    vi.unstubAllEnvs()
    vi.stubEnv("BACKEND_URL", "http://127.0.0.1:8000")

    mockFetch.mockResolvedValueOnce(quotaRes(5, 5))
    const body = await expectError(
      await postJson({ headers: { cookie: sealCookie("openai") } }),
      400
    )
    expect(body.error).toContain("Quota limit reached")
    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  it("generates challenge, strips BYOK cookie from backend calls, and propagates Set-Cookie", async () => {
    const rawKey = "sk-anthropic-secret-9999"
    const persisted = { id: 42, ...GENERATED_OUTPUT, is_custom: true }
    mockGenerateText.mockResolvedValueOnce({ output: GENERATED_OUTPUT })
    mockFetch.mockResolvedValueOnce(quotaRes(1, 5)).mockResolvedValueOnce(
      jsonRes(persisted, 200, {
        "set-cookie":
          "diffly_guest_session=new-guest; Path=/; HttpOnly; SameSite=Lax",
      })
    )

    const res = await postJson({
      headers: {
        cookie: `${sealCookie("anthropic", rawKey)}; diffly_access_token=jwt-tok; evil_cookie=drop`,
        authorization: "Bearer jwt-tok",
      },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("set-cookie")).toContain(
      "diffly_guest_session=new-guest"
    )
    expect(await res.json()).toEqual(persisted)

    const [persistUrl, persistInit] = mockFetch.mock.calls[1] as [
      string,
      RequestInit,
    ]
    const persistHeaders = persistInit.headers as Record<string, string>
    expect(persistUrl).toBe("http://127.0.0.1:8000/api/challenges/custom")
    expect(persistHeaders.cookie).toBe("diffly_access_token=jwt-tok")
    expect(persistHeaders.cookie).not.toContain(BYOK_COOKIE_NAME)
    expect(persistHeaders.cookie).not.toContain("evil_cookie")
    expect(String(persistInit.body)).not.toContain(rawKey)
    expect(JSON.parse(String(persistInit.body))).toEqual({
      ...GENERATED_OUTPUT,
      topic: "SQL injection in order lookup",
    })
  })

  it("retries once on FastAPI 422, NoObjectGeneratedError, or empty fields, and preserves user payload", async () => {
    const mismatched: GeneratedChallenge = {
      ...GENERATED_OUTPUT,
      language: "python",
      difficulty: "Easy",
    }
    mockGenerateText
      .mockResolvedValueOnce({
        output: { ...GENERATED_OUTPUT, expected_issues: [] },
      })
      .mockResolvedValueOnce({ output: mismatched })
    mockFetch
      .mockResolvedValueOnce(
        quotaRes(0, 5, {
          "set-cookie": "diffly_guest_session=quota-guest; Path=/; HttpOnly",
        })
      )
      .mockResolvedValueOnce(jsonRes({ id: 9, ...mismatched }, 200))

    const res = await postJson({
      body: {
        topic: "Rust unsafe pointer lifetime flaw",
        language: "rust",
        difficulty: "Hard",
      },
      headers: { cookie: sealCookie("google") },
    })
    const promptAt = (idx: number) =>
      String(
        (mockGenerateText.mock.calls[idx]?.[0] as { prompt?: string })
          ?.prompt ?? ""
      )
    expect(res.status).toBe(200)
    expect(mockGenerateText).toHaveBeenCalledTimes(2)
    expect(promptAt(0)).not.toContain("Previous Attempt Corrections:")
    expect(promptAt(1)).toContain("Previous Attempt Corrections:")
    expect(promptAt(1)).toContain(
      "expected_issues must contain at least one issue."
    )
    expect(res.headers.get("set-cookie")).toContain(
      "diffly_guest_session=quota-guest"
    )
    const [, persistInit] = mockFetch.mock.calls[1] as [string, RequestInit]
    expect(JSON.parse(String(persistInit.body))).toMatchObject({
      topic: "Rust unsafe pointer lifetime flaw",
      language: "rust",
      difficulty: "Hard",
    })

    mockGenerateText.mockReset()
    mockFetch.mockReset()
    mockGenerateText.mockResolvedValue({ output: GENERATED_OUTPUT })
    mockFetch
      .mockResolvedValueOnce(quotaRes(0, 5))
      .mockResolvedValueOnce(jsonRes({ detail: "Failed 1" }, 422))
      .mockResolvedValueOnce(jsonRes({ detail: "Failed 2" }, 422))
    await expectError(
      await postJson({ headers: { cookie: sealCookie("google") } }),
      502,
      "Failed 2"
    )
    expect(mockGenerateText).toHaveBeenCalledTimes(2)
    expect(promptAt(1)).toContain("Previous Attempt Corrections:")
    expect(promptAt(1)).toContain("- Failed 1")

    mockGenerateText.mockReset()
    mockFetch.mockReset()
    mockFetch.mockResolvedValueOnce(quotaRes(0, 5))
    mockGenerateText.mockRejectedValue(new Error("No object"))
    vi.spyOn(NoObjectGeneratedError, "isInstance").mockReturnValueOnce(true)
    vi.spyOn(NoObjectGeneratedError, "isInstance").mockReturnValueOnce(true)
    await expectError(
      await postJson({ headers: { cookie: sealCookie("openai") } }),
      502
    )
    expect(mockGenerateText).toHaveBeenCalledTimes(2)
  })

  it("maps provider errors without leaking apiKey and filters Set-Cookie headers", async () => {
    const secretKey = "sk-ultra-secret-do-not-leak"
    const cookie = sealCookie("openai", secretKey)
    mockFetch.mockImplementation(() => Promise.resolve(quotaRes(0, 5)))

    mockGenerateText.mockRejectedValueOnce({ statusCode: 401 })
    const authBody = await expectError(
      await postJson({ headers: { cookie } }),
      401
    )
    expect(JSON.stringify(authBody)).not.toContain(secretKey)

    mockGenerateText.mockRejectedValueOnce({ statusCode: 429 })
    await expectError(await postJson({ headers: { cookie } }), 429)

    mockGenerateText.mockRejectedValueOnce(
      Object.assign(new Error(`Timed out ${secretKey}`), {
        name: "TimeoutError",
      })
    )
    const timeoutBody = await expectError(
      await postJson({ headers: { cookie } }),
      504
    )
    expect(JSON.stringify(timeoutBody)).not.toContain(secretKey)

    mockGenerateText.mockRejectedValue(new Error(`Crash ${secretKey}`))
    const crashBody = await expectError(
      await postJson({ headers: { cookie } }),
      502
    )
    expect(JSON.stringify(crashBody)).not.toContain(secretKey)
    expect(mockGenerateText).toHaveBeenCalledTimes(4)

    vi.stubEnv("BACKEND_URL", "")
    vi.stubEnv("VERCEL", "1")
    vi.stubEnv("VERCEL_URL", "diffly-preview.vercel.app")
    const spoofedReq = new NextRequest("https://spoofed.example.com/api/ai")
    expect(resolveInternalBackendOrigin(spoofedReq)).toBe(
      "https://diffly-preview.vercel.app"
    )
    vi.unstubAllEnvs()
    vi.stubEnv("BACKEND_URL", "http://127.0.0.1:8000")

    const upstreamHeaders = new Headers()
    upstreamHeaders.append(
      "set-cookie",
      "diffly_guest_session=allowed-1; Path=/; HttpOnly"
    )
    upstreamHeaders.append(
      "set-cookie",
      "diffly_byok=forged-cookie; Path=/api; HttpOnly"
    )
    mockFetch.mockResolvedValueOnce(quotaRes(5, 5, upstreamHeaders))
    const res = await postJson({ headers: { cookie } })
    expect(res.status).toBe(400)
    expect(res.headers.get("set-cookie")).toContain(
      "diffly_guest_session=allowed-1"
    )
    expect(res.headers.get("set-cookie")).not.toContain("diffly_byok")
    expect(propagateBackendSetCookies).toBeTypeOf("function")
  })
})
