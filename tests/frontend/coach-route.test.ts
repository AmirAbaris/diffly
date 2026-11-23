import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockStreamText = vi.hoisted(() => vi.fn())
const mockFetch = vi.hoisted(() => vi.fn())

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>()
  return { ...actual, streamText: mockStreamText }
})

import { POST } from "@/app/api/coach/route"
import type { CoachPatternsSnapshot } from "@/lib/ai/coach"
import { BYOK_COOKIE_NAME, sealAICredential } from "@/lib/ai/cookie"

const VALID_PATTERNS: CoachPatternsSnapshot = {
  total_submissions: 4,
  total_missed_submissions: 2,
  weakest_slices: [
    {
      category: "Concurrency",
      language: "go",
      difficulty: "Medium",
      attempts: 2,
      unique_challenges: 2,
      average_score: 52,
      precision: 65,
      recall: 45,
      concept_coverage: 50,
      dominant_failure_mode: "low_recall",
    },
  ],
  strongest_slices: [],
  recent_missed: [
    {
      challenge_slug: "mutex-unlock-defer",
      title: "Deferred Mutex Unlock Leak",
      category: "Concurrency",
      language: "go",
      difficulty: "Medium",
      score: 50,
      missed_line_count: 1,
      false_positive_count: 0,
      submitted_at: "2026-11-21T09:30:00Z",
    },
  ],
}

const VALID_MESSAGES = [
  {
    id: "msg-1",
    role: "user",
    parts: [{ type: "text", text: "What pattern am I missing?" }],
  },
]

const jsonRes = (
  data: unknown,
  status = 200,
  initHeaders: HeadersInit = {}
) => {
  const headers = new Headers(initHeaders)
  headers.set("content-type", "application/json")
  return new Response(JSON.stringify(data), { status, headers })
}

const sealCookie = (
  provider: "google" | "openai" | "anthropic" = "openai",
  apiKey = "sk-test-secret-1234"
) =>
  `${BYOK_COOKIE_NAME}=${sealAICredential({ provider, model: "test-model", apiKey })}`

const postCoach = (
  opts: {
    body?: unknown
    rawBody?: string
    headers?: Record<string, string>
    signal?: AbortSignal
  } = {}
) =>
  POST(
    new NextRequest("http://localhost:3000/api/coach", {
      method: "POST",
      headers: { "content-type": "application/json", ...opts.headers },
      body:
        opts.rawBody ??
        JSON.stringify(
          opts.body ?? { mode: "patterns", messages: VALID_MESSAGES }
        ),
      signal: opts.signal,
    })
  )

async function expectError(res: Response, status: number, message?: string) {
  expect(res.status).toBe(status)
  expect(res.headers.get("cache-control")).toBe("no-store")
  expect(res.headers.get("vary")).toBe("Cookie")
  const body = (await res.json()) as Record<string, unknown>
  if (message) expect(body.error).toBe(message)
  return body
}

describe("app/api/coach/route", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch)
    vi.stubEnv("BACKEND_URL", "http://127.0.0.1:8000")
    mockStreamText.mockImplementation(() => ({
      toUIMessageStreamResponse: (options?: {
        headers?: Record<string, string>
      }) =>
        new Response('data: {"type":"start"}\n\n', {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
            ...options?.headers,
          },
        }),
    }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    mockStreamText.mockReset()
    mockFetch.mockReset()
  })

  it("rejects cross-site, non-JSON, malformed JSON, invalid payload, and missing/invalid BYOK cookies", async () => {
    await expectError(
      await postCoach({ headers: { origin: "https://evil.example.com" } }),
      403
    )
    await expectError(
      await postCoach({ headers: { "sec-fetch-site": "cross-site" } }),
      403
    )
    await expectError(
      await postCoach({
        headers: { "content-type": "text/plain" },
        rawBody: "x",
      }),
      415
    )
    await expectError(await postCoach({ rawBody: "{not-json" }), 400)
    await expectError(
      await postCoach({ body: { mode: "unknown", messages: VALID_MESSAGES } }),
      400
    )
    await expectError(
      await postCoach({
        body: { mode: "patterns", user_id: 99, messages: VALID_MESSAGES },
      }),
      400
    )
    await expectError(await postCoach(), 401)
    await expectError(
      await postCoach({
        headers: { cookie: `${BYOK_COOKIE_NAME}=v1.tampered.val.x` },
      }),
      401
    )
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockStreamText).not.toHaveBeenCalled()
  })

  it("returns 500 when BYOK secret is misconfigured in production", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("BYOK_COOKIE_SECRET", "")

    await expectError(
      await postCoach({
        headers: { cookie: `${BYOK_COOKIE_NAME}=v1.a.b.c` },
      }),
      500,
      "AI connection service is not configured."
    )
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockStreamText).not.toHaveBeenCalled()
  })

  it("fetches patterns with allowlisted cookies, propagates Set-Cookie, and streams response", async () => {
    const rawKey = "sk-anthropic-coach-secret-777"
    const upstreamHeaders = new Headers()
    upstreamHeaders.append(
      "set-cookie",
      "diffly_guest_session=guest-coach-1; Path=/; HttpOnly; SameSite=Lax"
    )
    upstreamHeaders.append(
      "set-cookie",
      `${BYOK_COOKIE_NAME}=forged-by-upstream; Path=/api; HttpOnly`
    )
    mockFetch.mockResolvedValueOnce(
      jsonRes(VALID_PATTERNS, 200, upstreamHeaders)
    )

    let capturedOnError: ((error: unknown) => string) | undefined
    mockStreamText.mockImplementationOnce(() => ({
      toUIMessageStreamResponse: (options?: {
        headers?: Record<string, string>
        onError?: (error: unknown) => string
      }) => {
        capturedOnError = options?.onError
        return new Response('data: {"type":"start"}\n\n', {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
            ...options?.headers,
          },
        })
      },
    }))

    const controller = new AbortController()
    const res = await postCoach({
      body: {
        mode: "patterns",
        messages: VALID_MESSAGES,
        sliceLimit: 3,
        missedLimit: 7,
      },
      headers: {
        cookie: `${sealCookie("anthropic", rawKey)}; diffly_access_token=jwt-coach; diffly_guest_session=gs-1; evil_cookie=drop`,
        authorization: "Bearer jwt-coach",
      },
      signal: controller.signal,
    })

    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(res.headers.get("vary")).toBe("Cookie")
    expect(res.headers.get("set-cookie")).toContain(
      "diffly_guest_session=guest-coach-1"
    )
    expect(res.headers.get("set-cookie")).not.toContain("forged-by-upstream")

    const [fetchUrl, fetchInit] = mockFetch.mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(fetchUrl).toBe(
      "http://127.0.0.1:8000/api/user/coach-patterns?slice_limit=3&missed_limit=7"
    )
    expect(fetchInit.cache).toBe("no-store")
    const forwardedHeaders = fetchInit.headers as Record<string, string>
    expect(forwardedHeaders.cookie).toBe(
      "diffly_access_token=jwt-coach; diffly_guest_session=gs-1"
    )
    expect(forwardedHeaders.cookie).not.toContain(BYOK_COOKIE_NAME)
    expect(forwardedHeaders.authorization).toBe("Bearer jwt-coach")

    const streamArgs = mockStreamText.mock.calls[0][0] as {
      system: string
      messages: unknown[]
      tools: Record<string, unknown>
      stopWhen: (ctx: { steps: unknown[] }) => boolean
      maxRetries: number
      abortSignal: AbortSignal
    }
    expect(streamArgs.system).toContain("Deferred Mutex Unlock Leak")
    expect(streamArgs.system).toContain("Concurrency / go / Medium")
    expect(streamArgs.tools).toHaveProperty("suggest_targeted_drill")
    expect(streamArgs.messages).toHaveLength(1)
    expect(streamArgs.maxRetries).toBe(0)
    expect(streamArgs.stopWhen({ steps: [{}] })).toBe(false)
    expect(streamArgs.stopWhen({ steps: [{}, {}, {}] })).toBe(true)
    expect(streamArgs.abortSignal).toBeInstanceOf(AbortSignal)

    const mappedErr = capturedOnError!(new Error(`Provider failed ${rawKey}`))
    expect(mappedErr).toBe("Failed to connect to the AI provider.")
    expect(mappedErr).not.toContain(rawKey)
    expect(capturedOnError!({ statusCode: 401 })).toBe(
      "Authentication failed. Check your API key and permissions."
    )
    controller.abort()
    expect(capturedOnError!(new Error("aborted"))).toBe(
      "Coach response was cancelled."
    )
  })

  it("handles upstream errors, invalid snapshots, timeouts, and aborts in patterns mode", async () => {
    const cookie = sealCookie("openai")

    mockFetch.mockResolvedValueOnce(
      jsonRes({ detail: "Backend unavailable" }, 502, {
        "set-cookie": "diffly_guest_session=err-guest; Path=/; HttpOnly",
      })
    )
    const badUpstream = await postCoach({ headers: { cookie } })
    await expectError(badUpstream, 502, "Backend unavailable")
    expect(badUpstream.headers.get("set-cookie")).toContain(
      "diffly_guest_session=err-guest"
    )

    mockFetch.mockResolvedValueOnce(jsonRes({ unexpected: true }, 200))
    await expectError(await postCoach({ headers: { cookie } }), 502)

    mockFetch.mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
    await expectError(await postCoach({ headers: { cookie } }), 502)

    mockFetch.mockRejectedValueOnce(
      Object.assign(new Error("Timed out"), { name: "TimeoutError" })
    )
    await expectError(await postCoach({ headers: { cookie } }), 504)

    const controller = new AbortController()
    controller.abort()
    mockFetch.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"))
    await expectError(
      await postCoach({ headers: { cookie }, signal: controller.signal }),
      499,
      "Coach response was cancelled."
    )
    expect(mockStreamText).not.toHaveBeenCalled()
  })

  it("skips backend fetch in debrief mode and streams delimited debrief prompt", async () => {
    const res = await postCoach({
      body: {
        mode: "debrief",
        messages: VALID_MESSAGES,
        context: {
          challengeSlug: "race-condition-cache",
          challengeTitle: "Race Condition in Cache",
          language: "go",
          codeSnippet: "cache[k] = v // unsynchronized",
          userFlaggedLines: [1],
          userComments: "Missing mutex around map write",
          score: 68,
          canonicalReview: "Protect map writes with sync.RWMutex.",
        },
      },
      headers: { cookie: sealCookie("google") },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(res.headers.get("vary")).toBe("Cookie")
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockStreamText).toHaveBeenCalledTimes(1)

    const streamArgs = mockStreamText.mock.calls[0][0] as {
      system: string
      tools: Record<string, unknown>
    }
    expect(streamArgs.system).toContain("<code_under_review>")
    expect(streamArgs.system).toContain("cache[k] = v // unsynchronized")
    expect(streamArgs.system).toContain("<user_critique>")
    expect(streamArgs.system).toContain("Missing mutex around map write")
    expect(streamArgs.system).toContain("<canonical_review>")
    expect(streamArgs.system).toContain("Protect map writes with sync.RWMutex.")
    expect(streamArgs.tools).toHaveProperty("suggest_targeted_drill")
  })
})
