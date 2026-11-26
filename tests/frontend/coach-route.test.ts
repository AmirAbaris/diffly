import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const [
  mockStreamText,
  mockToUIMessageStream,
  mockCreateUIMessageStreamResponse,
  mockSmoothStream,
  mockFetch,
] = vi.hoisted(() => [vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()])

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  streamText: mockStreamText,
  toUIMessageStream: mockToUIMessageStream,
  createUIMessageStreamResponse: mockCreateUIMessageStreamResponse,
  smoothStream: mockSmoothStream,
}))

import { POST } from "@/app/api/coach/route"
import {
  type BackendSubmissionDebrief,
  COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
  COACH_SUGGEST_DRILL_TOOL_NAME,
  type CoachPatternsSnapshot,
  CoachToolError,
} from "@/lib/ai/coach"
import { BYOK_COOKIE_NAME, sealAICredential } from "@/lib/ai/cookie"
import {
  COACH_PERSISTENCE_HEADER,
  COACH_THREAD_ID_HEADER,
} from "@/lib/server/coach-threads"

const THREAD_UUID = "11111111-1111-4111-8111-111111111111"
const MISSED_ROW = {
  challenge_slug: "mutex-unlock-defer",
  title: "Deferred Mutex Unlock Leak",
  category: "Concurrency",
  language: "go",
  difficulty: "Medium",
  score: 50,
  missed_line_count: 1,
  false_positive_count: 0,
  submitted_at: "2026-11-21T09:30:00Z",
}
const VALID_PATTERNS: CoachPatternsSnapshot = {
  total_submissions: 4,
  total_missed_submissions: 2,
  weakest_slices: [],
  strongest_slices: [],
  recent_missed: [MISSED_ROW],
}
const VALID_DEBRIEF = {
  ...MISSED_ROW,
  submission_id: 11,
  flagged_lines: [12],
  false_positive_lines: [],
  comments: "",
  detected_issues: [],
  missed_issues: [],
  code_snippet: "mu.Lock()",
  files: [],
  canonical_review: "Use defer.",
  recommended_fix_diff: "",
  expected_issues: [],
  truncated: false,
} satisfies BackendSubmissionDebrief
const VALID_MESSAGES = [
  { id: "msg-1", role: "user", parts: [{ type: "text", text: "Help?" }] },
]
const jsonRes = (data: unknown, status = 200, headers?: HeadersInit) => {
  const h = new Headers(headers)
  h.set("content-type", "application/json")
  return new Response(JSON.stringify(data), { status, headers: h })
}
const sealCookie = (
  provider: "google" | "openai" | "anthropic" = "openai",
  apiKey = "sk-test-secret-1234"
) => `${BYOK_COOKIE_NAME}=${sealAICredential({ provider, model: "m", apiKey })}`
type PostOpts = {
  body?: unknown
  rawBody?: string
  headers?: HeadersInit
  signal?: AbortSignal
}
const postCoach = ({ body, rawBody, headers, signal }: PostOpts = {}) =>
  POST(
    new NextRequest("http://localhost:3000/api/coach", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body:
        rawBody ??
        JSON.stringify(body ?? { mode: "patterns", messages: VALID_MESSAGES }),
      signal,
    })
  )
const expectRes = async (
  res: Response,
  status: number,
  opts?: { error?: string; tid?: string | null; deg?: string | null }
) => {
  expect(res.status).toBe(status)
  expect(res.headers.get("cache-control")).toBe("no-store")
  expect(res.headers.get("vary")).toBe("Cookie")
  if (opts?.error) expect((await res.json()).error).toBe(opts.error)
  if (opts && "tid" in opts) {
    expect(res.headers.get(COACH_THREAD_ID_HEADER)).toBe(opts.tid ?? null)
    expect(res.headers.get(COACH_PERSISTENCE_HEADER)).toBe(opts.deg ?? null)
  }
}
const expectAuthFetch = (idx: number, path: string) => {
  const [url, init] = mockFetch.mock.calls[idx] as [string, RequestInit]
  expect(url).toBe(`http://127.0.0.1:8000${path}`)
  expect(init).toMatchObject({
    cache: "no-store",
    redirect: "error",
    headers: expect.objectContaining({
      cookie: "diffly_access_token=jwt-coach; diffly_guest_session=gs-1",
      authorization: "Bearer jwt-coach",
    }),
  })
}
const callDebrief = (
  args: {
    tools: {
      get_submission_debrief: { execute: (...a: unknown[]) => Promise<unknown> }
    }
  },
  slug: string
) => args.tools.get_submission_debrief.execute({ challengeSlug: slug }, {})

describe("app/api/coach/route", () => {
  const mockTransform = () => new TransformStream()

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch)
    vi.stubEnv("BACKEND_URL", "http://127.0.0.1:8000")
    mockSmoothStream.mockReturnValue(mockTransform)
    mockStreamText.mockImplementation(() => ({ stream: new ReadableStream() }))
    mockToUIMessageStream.mockImplementation(() => new ReadableStream())
    mockCreateUIMessageStreamResponse.mockImplementation(
      ({ headers }: { headers?: Record<string, string> } = {}) =>
        new Response('data: {"type":"start"}\n\n', { status: 200, headers })
    )
  })
  afterEach(
    () => (vi.unstubAllEnvs(), vi.unstubAllGlobals(), vi.resetAllMocks())
  )

  it("rejects cross-site, invalid payloads, missing/invalid BYOK, and misconfigured secret", async () => {
    const m = VALID_MESSAGES
    const bad = `${BYOK_COOKIE_NAME}=v1.tampered.val.x`
    for (const [o, s] of [
      [{ headers: { origin: "https://evil.example.com" } }, 403],
      [{ headers: { "sec-fetch-site": "cross-site" } }, 403],
      [{ headers: { "content-type": "text/plain" }, rawBody: "x" }, 415],
      [{ rawBody: "{not-json" }, 400],
      [{ body: { mode: "unknown", messages: m } }, 400],
      [{ body: { mode: "patterns", user_id: 99, messages: m } }, 400],
      [{}, 401],
      [{ headers: { cookie: bad } }, 401],
    ] as const) {
      await expectRes(await postCoach(o), s)
    }
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("BYOK_COOKIE_SECRET", "")
    const mis = await postCoach({
      headers: { cookie: `${BYOK_COOKIE_NAME}=v1.a.b.c` },
    })
    await expectRes(mis, 500, {
      error: "AI connection service is not configured.",
    })
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockStreamText).not.toHaveBeenCalled()
  })

  it("fetches patterns, lazily creates a thread, wires debrief tool, and persists onEnd", async () => {
    const rawKey = "sk-anthropic-coach-secret-777"
    const h = new Headers([
      ["set-cookie", "diffly_guest_session=guest-coach-1; Path=/"],
      ["set-cookie", `${BYOK_COOKIE_NAME}=forged; Path=/api`],
    ])
    mockFetch
      .mockResolvedValueOnce(jsonRes(VALID_PATTERNS, 200, h))
      .mockResolvedValueOnce(jsonRes({ id: THREAD_UUID }, 201))
    const controller = new AbortController()
    const cookie = `${sealCookie("anthropic", rawKey)}; diffly_access_token=jwt-coach; diffly_guest_session=gs-1; evil=drop`
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

    await expectRes(res, 200, { tid: THREAD_UUID, deg: null })
    const setCookie = res.headers.get("set-cookie") ?? ""
    expect([
      setCookie.includes("diffly_guest_session=guest-coach-1"),
      setCookie.includes("forged"),
    ]).toEqual([true, false])
    expectAuthFetch(0, "/api/user/coach-patterns?slice_limit=3&missed_limit=7")
    expectAuthFetch(1, "/api/user/coach-threads")

    const streamArgs = mockStreamText.mock.calls[0][0]
    expect([
      streamArgs.instructions.includes("Deferred Mutex Unlock Leak"),
      streamArgs.experimental_transform === mockTransform,
      streamArgs.stopWhen({ steps: [{}] }),
      streamArgs.stopWhen({ steps: [{}, {}, {}] }),
    ]).toEqual([true, true, false, true])

    mockFetch.mockResolvedValueOnce(jsonRes(VALID_DEBRIEF, 200))
    expect(await callDebrief(streamArgs, "mutex-unlock-defer")).toMatchObject({
      challengeSlug: "mutex-unlock-defer",
      score: 50,
    })
    expectAuthFetch(2, "/api/user/coach-submissions/mutex-unlock-defer")

    const missingMsg = "No prior submission found for this challenge."
    const invalidMsg = "Invalid submission debrief response from backend."
    for (const [s, d, m] of [
      [404, { detail: "Not found" }, missingMsg],
      [500, { detail: "DB error" }, "DB error"],
      [200, "not-json", invalidMsg],
      [200, { x: 1 }, invalidMsg],
    ] as const) {
      mockFetch.mockResolvedValueOnce(
        typeof d === "string" ? new Response(d, { status: s }) : jsonRes(d, s)
      )
      await expect(callDebrief(streamArgs, "bad")).rejects.toThrow(m)
    }
    mockFetch.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"))
    const abortErr = await callDebrief(streamArgs, "a").catch((e) => e)
    expect(abortErr).not.toBeInstanceOf(CoachToolError)

    const uiArgs = mockToUIMessageStream.mock.calls[0][0]
    expect([
      uiArgs.sendReasoning,
      uiArgs.originalMessages.length,
      /^[0-9a-f-]{36}$/i.test(uiArgs.generateMessageId()),
    ]).toEqual([true, 1, true])
    mockFetch.mockResolvedValueOnce(jsonRes({ message_count: 2 }, 201))
    await uiArgs.onEnd({
      isAborted: false,
      isContinuation: false,
      outcome: { status: "completed" },
      responseMessage: {
        id: "r1",
        role: "assistant",
        parts: [{ type: "text", text: "Done." }],
      },
    })
    const [pUrl, pInit] = mockFetch.mock.calls.at(-1) as [string, RequestInit]
    expect(pUrl).toBe(
      `http://127.0.0.1:8000/api/user/coach-threads/${THREAD_UUID}/messages`
    )
    expect(JSON.parse(String(pInit.body)).messages).toHaveLength(2)

    expect([
      uiArgs.onError(new Error(`Provider failed ${rawKey}`)),
      uiArgs.onError({ statusCode: 401 }),
      uiArgs.onError(new CoachToolError(missingMsg)),
      uiArgs.onError(abortErr),
    ]).toEqual([
      "Failed to connect to the AI provider.",
      "Authentication failed. Check your API key and permissions.",
      missingMsg,
      "Provider connection timed out.",
    ])
    controller.abort()
    expect(uiArgs.onError(new Error("aborted"))).toBe(
      "Coach response was cancelled."
    )
  })

  it("reuses threadId, trims leading assistant messages, and degrades on creation failure", async () => {
    const cookie = sealCookie("openai")
    mockFetch.mockResolvedValueOnce(jsonRes(VALID_PATTERNS, 200))
    const body = {
      mode: "patterns",
      threadId: THREAD_UUID,
      messages: [
        { id: "a-0", role: "assistant", parts: [{ type: "text", text: "X" }] },
        ...VALID_MESSAGES,
      ],
    }
    await expectRes(await postCoach({ body, headers: { cookie } }), 200, {
      tid: THREAD_UUID,
      deg: null,
    })
    expect([
      mockFetch.mock.calls.length,
      mockStreamText.mock.calls[0][0].messages[0]?.role,
    ]).toEqual([1, "user"])

    for (const [status, deg] of [
      [401, "unauthenticated"],
      [409, "quota-exceeded"],
      [500, "upstream-error"],
    ] as const) {
      mockFetch
        .mockResolvedValueOnce(jsonRes(VALID_PATTERNS, 200))
        .mockResolvedValueOnce(jsonRes({ detail: "err" }, status))
      await expectRes(await postCoach({ headers: { cookie } }), 200, {
        tid: null,
        deg,
      })
      expect(mockToUIMessageStream.mock.calls.at(-1)?.[0].onEnd).toBeUndefined()
    }
  })

  it("handles upstream errors, aborts, and debrief mode without thread creation", async () => {
    const cookie = sealCookie("openai")
    const ctrl = new AbortController()
    ctrl.abort()
    mockFetch
      .mockResolvedValueOnce(
        jsonRes({ detail: "Down" }, 502, {
          "set-cookie": "diffly_guest_session=err-guest; Path=/",
        })
      )
      .mockResolvedValueOnce(jsonRes({ unexpected: true }, 200))
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockRejectedValueOnce(
        Object.assign(new Error("t"), { name: "TimeoutError" })
      )
      .mockRejectedValueOnce(new DOMException("Aborted", "AbortError"))
    const bad = await postCoach({ headers: { cookie } })
    await expectRes(bad, 502, { error: "Down" })
    expect(bad.headers.get("set-cookie")).toContain(
      "diffly_guest_session=err-guest"
    )
    for (const s of [502, 502, 504]) {
      await expectRes(await postCoach({ headers: { cookie } }), s)
    }
    const aborted = await postCoach({
      headers: { cookie },
      signal: ctrl.signal,
    })
    await expectRes(aborted, 499, { error: "Coach response was cancelled." })
    expect(mockStreamText).not.toHaveBeenCalled()

    const debriefBody = {
      mode: "debrief",
      messages: VALID_MESSAGES,
      context: { challengeSlug: "rc", score: 68 },
    }
    const debriefRes = await postCoach({
      body: debriefBody,
      headers: { cookie: sealCookie("google") },
    })
    await expectRes(debriefRes, 200, { tid: null, deg: null })
    const debriefArgs = mockStreamText.mock.calls[0][0]
    expect([
      mockToUIMessageStream.mock.calls[0][0].onEnd,
      debriefArgs.activeTools,
    ]).toEqual([
      undefined,
      [COACH_SUGGEST_DRILL_TOOL_NAME, COACH_CONFIGURE_CHALLENGE_TOOL_NAME],
    ])
    await expect(callDebrief(debriefArgs, "rc")).rejects.toThrow("unavailable")
  })
})
