import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { COACH_MAX_TEXT_PART_CHARS, type CoachUIMessage } from "@/lib/ai/coach"
import {
  hydrateCoachThreadMessages,
  sliceCoachMessageWindow,
} from "@/lib/ai/coach-window"
import { BYOK_COOKIE_NAME } from "@/lib/ai/cookie"
import {
  buildPersistableTurnBatch,
  ensureCoachThread,
  persistCoachTurn,
} from "@/lib/server/coach-threads"

const mockFetch = vi.hoisted(() => vi.fn())
const okOutcome = { status: "completed" } as const
const uMsg = (id: string, text: string): CoachUIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
})
const aMsg = (id: string, parts: CoachUIMessage["parts"]): CoachUIMessage => ({
  id,
  role: "assistant",
  parts,
})
const endEv = (
  responseMessage: CoachUIMessage,
  extra: Partial<Parameters<typeof buildPersistableTurnBatch>[1]> = {}
) => ({
  isAborted: false,
  isContinuation: false,
  outcome: okOutcome,
  responseMessage,
  ...extra,
})

describe("lib/ai/coach-window", () => {
  it("slices trailing messages, aligns to first user message, and clamps oversized text/reasoning", () => {
    const msgs: CoachUIMessage[] = [
      uMsg("u-1", "First"),
      aMsg("a-1", [{ type: "text", text: "Reply 1" }]),
      uMsg("u-2", "Second"),
      aMsg("a-2", [
        { type: "reasoning", text: "r".repeat(COACH_MAX_TEXT_PART_CHARS + 50) },
        { type: "text", text: "t".repeat(COACH_MAX_TEXT_PART_CHARS + 25) },
      ]),
      uMsg("u-3", "Third"),
    ]
    const windowed = sliceCoachMessageWindow(msgs, 4)
    expect(windowed.map((m) => m.id)).toEqual(["u-2", "a-2", "u-3"])
    expect(windowed[1].parts).toEqual([
      { type: "reasoning", text: "r".repeat(COACH_MAX_TEXT_PART_CHARS) },
      { type: "text", text: "t".repeat(COACH_MAX_TEXT_PART_CHARS) },
    ])
  })

  it("trims orphaned leading assistant messages and handles empty inputs", () => {
    const leading = [
      aMsg("a-0", [{ type: "text", text: "Orphan" }]),
      uMsg("u-1", "Hello"),
    ]
    expect(sliceCoachMessageWindow(leading).map((m) => m.id)).toEqual(["u-1"])
    expect(sliceCoachMessageWindow([])).toEqual([])
    expect(sliceCoachMessageWindow(leading, 0)).toEqual([])
  })

  it("hydrates valid FastAPI messages sorted by sequence asc and filters invalid records", () => {
    const toolPart = {
      type: "tool-suggest_targeted_drill",
      toolCallId: "tc-1",
      state: "output-available",
    }
    const bad = [
      {
        id: "bad id",
        role: "user",
        sequence: 1,
        parts: [{ type: "text", text: "x" }],
      },
      {
        id: "sys",
        role: "system",
        sequence: 1,
        parts: [{ type: "text", text: "x" }],
      },
      {
        id: "neg",
        role: "user",
        sequence: -1,
        parts: [{ type: "text", text: "x" }],
      },
      { id: "empty", role: "user", sequence: 3, parts: [] },
      null,
    ]
    const hydrated = hydrateCoachThreadMessages([
      {
        id: "a-2",
        role: "assistant",
        sequence: 2,
        parts: [
          { type: "step-start" },
          { type: "reasoning", text: "Thinking" },
          { type: "text", text: "Answer" },
          toolPart,
          { type: "unsupported", data: 123 },
        ],
      },
      {
        id: "u-1",
        role: "user",
        sequence: 0,
        parts: [
          { type: "text", text: "Question" },
          { type: "reasoning", text: "Drop" },
        ],
      },
      ...bad,
    ])
    expect(hydrated).toEqual([
      uMsg("u-1", "Question"),
      aMsg("a-2", [
        { type: "step-start" },
        { type: "reasoning", text: "Thinking" },
        { type: "text", text: "Answer" },
        toolPart as CoachUIMessage["parts"][number],
      ]),
    ])
    expect(hydrateCoachThreadMessages(null)).toEqual([])
  })
})

describe("lib/server/coach-threads buildPersistableTurnBatch", () => {
  it("persists [lastUser, sanitizedResponse] for a normal turn", () => {
    const orig = [
      uMsg("u-1", "Earlier"),
      aMsg("a-1", [{ type: "text", text: "Reply" }]),
      uMsg("u-2", "Latest"),
    ]
    const resp = aMsg("a-2", [
      { type: "step-start" },
      { type: "text", text: "Answer" },
    ])
    expect(buildPersistableTurnBatch(orig, endEv(resp))).toEqual([
      uMsg("u-2", "Latest"),
      resp,
    ])
  })

  it("persists only [sanitizedResponse] on continuation and includes terminal wizard on interruption", () => {
    const wizardOut = {
      type: "tool-configure_challenge",
      toolCallId: "tc-1",
      state: "output-available",
      input: {},
      output: { language: "python", difficulty: "Medium", topic: "SQLi" },
    } as CoachUIMessage["parts"][number]
    const cont = buildPersistableTurnBatch(
      [uMsg("u-1", "Generate"), aMsg("a-1", [wizardOut])],
      endEv(aMsg("a-1", [wizardOut, { type: "text", text: "Created." }]), {
        isContinuation: true,
      })
    )
    expect(cont).toHaveLength(1)
    expect(cont[0].id).toBe("a-1")

    const denied = aMsg("a-wiz", [
      {
        type: "tool-configure_challenge",
        toolCallId: "tc-wiz",
        state: "output-denied",
        input: {},
      } as CoachUIMessage["parts"][number],
    ])
    const interrupted = buildPersistableTurnBatch(
      [uMsg("u-1", "Make drill"), denied, uMsg("u-2", "Explain JWT")],
      endEv(aMsg("a-2", [{ type: "text", text: "JWT explanation." }]))
    )
    expect(interrupted.map((m) => m.id)).toEqual(["a-wiz", "u-2", "a-2"])
  })

  it("skips persistence on abort, cancel, failed outcome, or empty response", () => {
    const orig = [uMsg("u-1", "Hello")]
    const resp = aMsg("a-1", [{ type: "text", text: "Hi" }])
    const empty = aMsg("a-empty", [
      { type: "step-start" },
      { type: "text", text: "   " },
    ])
    for (const ev of [
      endEv(resp, { isAborted: true }),
      endEv(resp, { isCancelled: true }),
      endEv(resp, { outcome: { status: "failed" } }),
      endEv(empty),
    ]) {
      expect(buildPersistableTurnBatch(orig, ev)).toEqual([])
    }
  })

  it("sanitizes user part keys, strips null bytes and providerMetadata, and enforces caps", () => {
    const dirtyUser = {
      id: "u-clean",
      role: "user",
      parts: [
        { type: "text", text: "   \n\t  " },
        {
          type: "text",
          text: "Check\0 auth",
          state: "done",
          providerMetadata: { s: 1 },
        },
      ],
    } as unknown as CoachUIMessage
    const dirtyAssistant = {
      id: "a-clean",
      role: "assistant",
      parts: [
        {
          type: "text",
          text: "Answer\0 text",
          providerMetadata: { openai: { id: "1" } },
          callProviderMetadata: { raw: "drop" },
        },
        {
          type: "tool-suggest_targeted_drill",
          toolCallId: "tc-1",
          state: "output-available",
          callProviderMetadata: { trace: "drop" },
          input: { topic: "SQL\0i", nested: { providerMetadata: { drop: 1 } } },
        },
        { type: "source-url", url: "https://example.com" },
      ],
    } as unknown as CoachUIMessage
    const cleaned = buildPersistableTurnBatch(
      [dirtyUser],
      endEv(dirtyAssistant)
    )
    expect(cleaned[0].parts).toEqual([{ type: "text", text: "Check auth" }])
    expect(cleaned[1].parts).toEqual([
      { type: "text", text: "Answer text" },
      {
        type: "tool-suggest_targeted_drill",
        toolCallId: "tc-1",
        state: "output-available",
        input: { topic: "SQLi", nested: {} },
      },
    ])

    const oversized = aMsg(
      "a-big",
      Array.from({ length: 60 }, (_, idx) => ({
        type: "text" as const,
        text: `chunk-${idx}-${"x".repeat(4_000)}`,
      }))
    )
    const capped = buildPersistableTurnBatch(
      [uMsg("u-cap", "Hi")],
      endEv(oversized)
    )
    expect(capped[1].parts.length).toBeLessThanOrEqual(50)
    expect(
      new TextEncoder().encode(JSON.stringify(capped[1].parts)).byteLength
    ).toBeLessThanOrEqual(131_072)
  })
})

describe("lib/server/coach-threads ensureCoachThread & persistCoachTurn", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch)
    vi.stubEnv("BACKEND_URL", "http://127.0.0.1:8000")
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetAllMocks()
  })

  const makeReq = (headers?: HeadersInit) =>
    new NextRequest("http://localhost:3000/api/coach", {
      method: "POST",
      headers,
    })

  it("creates a thread on 201 and forwards only allowlisted cookies and authorization", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }),
        {
          status: 201,
          headers: {
            "content-type": "application/json",
            "set-cookie": "diffly_guest_session=gs-new; Path=/",
          },
        }
      )
    )
    const result = await ensureCoachThread({
      request: makeReq({
        cookie: `${BYOK_COOKIE_NAME}=sealed; diffly_access_token=jwt-1; diffly_guest_session=gs-1; extra=drop`,
        authorization: "Bearer jwt-1",
      }),
    })
    expect(result.status).toBe("created")
    if (result.status === "created") {
      expect(result.threadId).toBe("11111111-1111-4111-8111-111111111111")
      expect(result.headers.get("set-cookie")).toContain(
        "diffly_guest_session=gs-new"
      )
    }
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("http://127.0.0.1:8000/api/user/coach-threads")
    expect(init.method).toBe("POST")
    expect(init.body).toBe(JSON.stringify({ mode: "patterns" }))
    expect(init.headers).toEqual({
      cookie: "diffly_access_token=jwt-1; diffly_guest_session=gs-1",
      authorization: "Bearer jwt-1",
      "content-type": "application/json",
    })
  })

  it("maps 401, 409, 500, and network errors to ephemeral reasons and swallows persist failures", async () => {
    const req = makeReq()
    for (const [status, reason] of [
      [401, "unauthenticated"],
      [409, "quota-exceeded"],
      [500, "upstream-error"],
    ] as const) {
      mockFetch.mockResolvedValueOnce(new Response(null, { status }))
      expect(await ensureCoachThread({ request: req })).toMatchObject({
        status: "ephemeral",
        reason,
      })
    }
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"))
    expect(await ensureCoachThread({ request: req })).toMatchObject({
      status: "ephemeral",
      reason: "upstream-error",
    })

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    mockFetch.mockRejectedValueOnce(new Error("timeout"))
    const tid = "22222222-2222-4222-8222-222222222222"
    await expect(
      persistCoachTurn({
        request: makeReq({
          cookie: `${BYOK_COOKIE_NAME}=x; diffly_access_token=jwt-2`,
        }),
        threadId: tid,
        originalMessages: [uMsg("u-1", "Hi")],
        event: endEv(aMsg("a-1", [{ type: "text", text: "Hello" }])),
      })
    ).resolves.toBeUndefined()
    const [url, init] = mockFetch.mock.calls.at(-1) as [string, RequestInit]
    expect(url).toBe(
      `http://127.0.0.1:8000/api/user/coach-threads/${tid}/messages`
    )
    expect(init.headers).toEqual({
      cookie: "diffly_access_token=jwt-2",
      "content-type": "application/json",
    })
    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })
})
