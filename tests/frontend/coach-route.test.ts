import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockStreamText = vi.hoisted(() => vi.fn())
const mockToUIMessageStream = vi.hoisted(() => vi.fn())
const mockCreateUIMessageStreamResponse = vi.hoisted(() => vi.fn())
const mockSmoothStream = vi.hoisted(() => vi.fn())
const mockFetch = vi.hoisted(() => vi.fn())

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>()
  return {
    ...actual,
    streamText: mockStreamText,
    toUIMessageStream: mockToUIMessageStream,
    createUIMessageStreamResponse: mockCreateUIMessageStreamResponse,
    smoothStream: mockSmoothStream,
  }
})

import { POST } from "@/app/api/coach/route"
import {
  type BackendSubmissionDebrief,
  COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
  COACH_SUGGEST_DRILL_TOOL_NAME,
  type CoachPatternsSnapshot,
  CoachToolError,
} from "@/lib/ai/coach"
import { BYOK_COOKIE_NAME, sealAICredential } from "@/lib/ai/cookie"

type StreamArgs = {
  instructions: string
  activeTools?: string[]
  experimental_transform?: unknown
  tools: Record<
    string,
    { execute?: (i: { challengeSlug: string }, c: unknown) => Promise<unknown> }
  >
  stopWhen: (ctx: { steps: unknown[] }) => boolean
}

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

const VALID_DEBRIEF: BackendSubmissionDebrief = {
  ...VALID_PATTERNS.recent_missed[0],
  submission_id: 11,
  flagged_lines: [12],
  false_positive_lines: [],
  comments: "Forgot early return.",
  detected_issues: [],
  missed_issues: [],
  code_snippet: "mu.Lock()\nif err != nil { return }",
  files: [],
  canonical_review: "Use defer mu.Unlock().",
  recommended_fix_diff: "- mu.Unlock()\n+ defer mu.Unlock()",
  expected_issues: [],
  truncated: false,
}

const VALID_MESSAGES = [
  {
    id: "msg-1",
    role: "user",
    parts: [{ type: "text", text: "What pattern am I missing?" }],
  },
]

const jsonRes = (data: unknown, status = 200, headers?: HeadersInit) => {
  const h = new Headers(headers)
  h.set("content-type", "application/json")
  return new Response(JSON.stringify(data), { status, headers: h })
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
    headers?: HeadersInit
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

const expectNoStore = (res: Response, status: number) => {
  expect(res.status).toBe(status)
  expect(res.headers.get("cache-control")).toBe("no-store")
  expect(res.headers.get("vary")).toBe("Cookie")
}

async function expectError(res: Response, status: number, message?: string) {
  expectNoStore(res, status)
  if (message)
    expect(((await res.json()) as Record<string, unknown>).error).toBe(message)
}

function expectAuthFetch(idx: number, path: string) {
  const [url, init] = mockFetch.mock.calls[idx] as [string, RequestInit]
  expect(url).toBe(`http://127.0.0.1:8000${path}`)
  expect(init).toMatchObject({ cache: "no-store", redirect: "error" })
  expect(init.headers).toEqual({
    cookie: "diffly_access_token=jwt-coach; diffly_guest_session=gs-1",
    authorization: "Bearer jwt-coach",
  })
}

const callDebrief = (args: StreamArgs, slug: string) =>
  args.tools.get_submission_debrief.execute!(
    { challengeSlug: slug },
    { toolCallId: "tc", messages: [], context: {} }
  )

describe("app/api/coach/route", () => {
  const mockTransform = () => new TransformStream()

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch)
    vi.stubEnv("BACKEND_URL", "http://127.0.0.1:8000")
    mockSmoothStream.mockImplementation(() => mockTransform)
    mockStreamText.mockImplementation(() => ({ stream: new ReadableStream() }))
    mockToUIMessageStream.mockImplementation(() => new ReadableStream())
    mockCreateUIMessageStreamResponse.mockImplementation(
      ({ headers }: { headers?: Record<string, string> } = {}) =>
        new Response('data: {"type":"start"}\n\n', {
          status: 200,
          headers: { "content-type": "text/event-stream", ...headers },
        })
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetAllMocks()
  })

  it("rejects cross-site, non-JSON, malformed JSON, invalid payload, and missing/invalid BYOK cookies", async () => {
    const m = VALID_MESSAGES
    const bad = `${BYOK_COOKIE_NAME}=v1.tampered.val.x`
    const badReqs = [
      [{ headers: { origin: "https://evil.example.com" } }, 403],
      [{ headers: { "sec-fetch-site": "cross-site" } }, 403],
      [{ headers: { "content-type": "text/plain" }, rawBody: "x" }, 415],
      [{ rawBody: "{not-json" }, 400],
      [{ body: { mode: "unknown", messages: m } }, 400],
      [{ body: { mode: "patterns", user_id: 99, messages: m } }, 400],
      [{}, 401],
      [{ headers: { cookie: bad } }, 401],
    ] as const
    await Promise.all(
      badReqs.map(async ([o, s]) => expectError(await postCoach(o), s))
    )
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockStreamText).not.toHaveBeenCalled()
  })

  it("returns 500 when BYOK secret is misconfigured in production", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("BYOK_COOKIE_SECRET", "")
    await expectError(
      await postCoach({ headers: { cookie: `${BYOK_COOKIE_NAME}=v1.a.b.c` } }),
      500,
      "AI connection service is not configured."
    )
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("fetches patterns and wires get_submission_debrief with allowlisted cookies, Set-Cookie, and stream error mapping", async () => {
    const rawKey = "sk-anthropic-coach-secret-777"
    const h = new Headers([
      ["set-cookie", "diffly_guest_session=guest-coach-1; Path=/"],
      ["set-cookie", `${BYOK_COOKIE_NAME}=forged; Path=/api`],
    ])
    mockFetch.mockResolvedValueOnce(jsonRes(VALID_PATTERNS, 200, h))
    const controller = new AbortController()
    const cookie = `${sealCookie("anthropic", rawKey)}; diffly_access_token=jwt-coach; diffly_guest_session=gs-1; evil_cookie=drop`
    const res = await postCoach({
      body: {
        mode: "patterns",
        messages: VALID_MESSAGES,
        sliceLimit: 3,
        missedLimit: 7,
      },
      headers: { cookie, authorization: "Bearer jwt-coach" },
      signal: controller.signal,
    })

    expectNoStore(res, 200)
    const setCookie = res.headers.get("set-cookie")
    expect(setCookie).toContain("diffly_guest_session=guest-coach-1")
    expect(setCookie).not.toContain("forged")
    expectAuthFetch(0, "/api/user/coach-patterns?slice_limit=3&missed_limit=7")
    expect(mockSmoothStream).toHaveBeenCalledWith({ chunking: "word" })

    const streamArgs = mockStreamText.mock.calls[0][0] as StreamArgs
    expect(streamArgs.instructions).toMatch(
      /<code_under_review>[\s\S]*<user_critique>[\s\S]*<canonical_review>[\s\S]*untrusted data[\s\S]*get_submission_debrief[\s\S]*Concurrency \/ go \/ Medium[\s\S]*Deferred Mutex Unlock Leak/
    )
    expect(streamArgs.activeTools).toBeUndefined()
    expect(streamArgs.experimental_transform).toBe(mockTransform)
    expect(streamArgs.tools).toHaveProperty("suggest_targeted_drill")
    expect(streamArgs.stopWhen({ steps: [{}] })).toBe(false)
    expect(streamArgs.stopWhen({ steps: [{}, {}, {}] })).toBe(true)

    mockFetch.mockResolvedValueOnce(jsonRes(VALID_DEBRIEF, 200))
    const debriefOut = await callDebrief(streamArgs, "mutex-unlock-defer")
    expectAuthFetch(1, "/api/user/coach-submissions/mutex-unlock-defer")
    expect(debriefOut).toMatchObject({
      challengeSlug: "mutex-unlock-defer",
      score: 50,
    })

    const missingMsg = "No prior submission found for this challenge."
    const invalidMsg = "Invalid submission debrief response from backend."
    const checkErr = async (status: number, data: unknown, msg: string) => {
      mockFetch.mockResolvedValueOnce(
        typeof data === "string"
          ? new Response(data, { status })
          : jsonRes(data, status)
      )
      const err = await callDebrief(streamArgs, "bad-slug").catch(
        (e: unknown) => e
      )
      expect(err).toBeInstanceOf(CoachToolError)
      expect((err as Error).message).toBe(msg)
    }
    await checkErr(404, { detail: "Not found" }, missingMsg)
    await checkErr(500, { detail: "Debrief DB error" }, "Debrief DB error")
    await checkErr(200, "not-json", invalidMsg)
    await checkErr(200, { unexpected: true }, invalidMsg)

    mockFetch.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"))
    const abortErr = await callDebrief(streamArgs, "aborted-slug").catch(
      (e: unknown) => e
    )
    expect(abortErr).not.toBeInstanceOf(CoachToolError)
    expect((abortErr as Error).name).toBe("AbortError")

    const uiArgs = mockToUIMessageStream.mock.calls[0][0] as {
      stream: unknown
      sendReasoning: boolean
      tools: unknown
      onError: (e: unknown) => string
    }
    expect(uiArgs.stream).toBe(mockStreamText.mock.results[0].value.stream)
    expect(uiArgs.sendReasoning).toBe(true)
    expect(uiArgs.tools).toHaveProperty("suggest_targeted_drill")
    expect(mockCreateUIMessageStreamResponse).toHaveBeenCalledWith({
      stream: mockToUIMessageStream.mock.results[0].value,
      headers: { "Cache-Control": "no-store", Vary: "Cookie" },
    })
    const onErr = uiArgs.onError
    expect(onErr(new Error(`Provider failed ${rawKey}`))).toBe(
      "Failed to connect to the AI provider."
    )
    expect(onErr({ statusCode: 401 })).toBe(
      "Authentication failed. Check your API key and permissions."
    )
    expect(onErr(new CoachToolError(missingMsg))).toBe(missingMsg)
    expect(onErr(abortErr)).toBe("Provider connection timed out.")
    controller.abort()
    expect(onErr(new Error("aborted"))).toBe("Coach response was cancelled.")
  })

  it("handles upstream errors, invalid snapshots, timeouts, and aborts in patterns mode", async () => {
    const cookie = sealCookie("openai")
    mockFetch.mockResolvedValueOnce(
      jsonRes({ detail: "Backend unavailable" }, 502, {
        "set-cookie": "diffly_guest_session=err-guest; Path=/; HttpOnly",
      })
    )
    const bad = await postCoach({ headers: { cookie } })
    await expectError(bad, 502, "Backend unavailable")
    expect(bad.headers.get("set-cookie")).toContain(
      "diffly_guest_session=err-guest"
    )

    const ctrl = new AbortController()
    ctrl.abort()
    const fail = async (status: number, msg?: string, signal?: AbortSignal) =>
      expectError(await postCoach({ headers: { cookie }, signal }), status, msg)
    mockFetch.mockResolvedValueOnce(jsonRes({ unexpected: true }, 200))
    await fail(502)
    mockFetch.mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
    await fail(502)
    mockFetch.mockRejectedValueOnce(
      Object.assign(new Error("Timed out"), { name: "TimeoutError" })
    )
    await fail(504)
    mockFetch.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"))
    await fail(499, "Coach response was cancelled.", ctrl.signal)
    expect(mockStreamText).not.toHaveBeenCalled()
  })

  it("skips backend fetch in debrief mode and excludes get_submission_debrief via activeTools", async () => {
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

    expectNoStore(res, 200)
    expect(mockFetch).not.toHaveBeenCalled()

    const streamArgs = mockStreamText.mock.calls[0][0] as StreamArgs
    expect(streamArgs.instructions).toMatch(
      /<code_under_review>[\s\S]*cache\[k\] = v \/\/ unsynchronized[\s\S]*<user_critique>[\s\S]*Missing mutex around map write[\s\S]*<canonical_review>[\s\S]*Protect map writes with sync\.RWMutex\./
    )
    expect(streamArgs.activeTools).toEqual([
      COACH_SUGGEST_DRILL_TOOL_NAME,
      COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
    ])
    expect(streamArgs.experimental_transform).toBe(mockTransform)
    await expect(
      callDebrief(streamArgs, "race-condition-cache")
    ).rejects.toThrow("Submission debrief lookup is unavailable in this mode.")
    expect(mockToUIMessageStream.mock.calls[0][0].sendReasoning).toBe(true)
  })
})
