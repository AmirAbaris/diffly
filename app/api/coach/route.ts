import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  smoothStream,
  stepCountIs,
  streamText,
  toUIMessageStream,
} from "ai"
import { NextRequest, NextResponse } from "next/server"

import {
  buildCoachSystemPrompt,
  COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
  COACH_MAX_STEPS,
  COACH_STREAM_TIMEOUT_MS,
  COACH_SUGGEST_DRILL_TOOL_NAME,
  type CoachPatternsSnapshot,
  type CoachPromptInput,
  CoachToolError,
  createCoachTools,
  parseCoachErrorMessage,
  parseCoachPatternsSnapshot,
  parseCoachRequest,
  type PatternsCoachRequest,
  type SubmissionDebriefFetcher,
} from "@/lib/ai/coach"
import { sliceCoachMessageWindow } from "@/lib/ai/coach-window"
import { BYOK_COOKIE_NAME, unsealAICredential } from "@/lib/ai/cookie"
import {
  isCrossSiteRequest,
  noStoreJson,
  requireJsonContentType,
} from "@/lib/ai/http"
import { createBYOKModel, mapProviderError } from "@/lib/ai/provider"
import {
  propagateBackendSetCookies,
  resolveInternalBackendOrigin,
} from "@/lib/server/backend-client"
import {
  buildCoachBackendHeaders,
  COACH_PERSISTENCE_HEADER,
  COACH_THREAD_ID_HEADER,
  ensureCoachThread,
  persistCoachTurn,
} from "@/lib/server/coach-threads"
import type { CoachPersistenceDegradationReason } from "@/types/coach-thread"

export const maxDuration = 60

const ABORT_MESSAGE = "Coach response was cancelled."
const MISSING_KEY_MESSAGE =
  "No active AI provider connection. Configure your API key in Settings."

function jsonError(
  msg: string,
  status: number,
  upstream?: Headers | readonly Headers[]
): NextResponse {
  const res = noStoreJson({ error: msg }, status)
  if (upstream) {
    const list = Array.isArray(upstream) ? upstream : [upstream]
    for (const headers of list) {
      propagateBackendSetCookies(headers, res)
    }
  }
  return res
}

async function fetchPatterns(
  request: NextRequest,
  req: PatternsCoachRequest,
  abortSignal: AbortSignal,
  mapError: (error: unknown) => { status: number; message: string }
): Promise<
  { patterns: CoachPatternsSnapshot; headers: Headers } | NextResponse
> {
  const origin = resolveInternalBackendOrigin(request)
  if (!origin)
    return jsonError("Backend service origin could not be resolved.", 502)

  let res: Response
  try {
    const url = `${origin}/api/user/coach-patterns?slice_limit=${req.sliceLimit}&missed_limit=${req.missedLimit}`
    res = await fetch(url, {
      method: "GET",
      headers: buildCoachBackendHeaders(request),
      cache: "no-store",
      redirect: "error",
      signal: abortSignal,
    })
  } catch (error) {
    const mapped = mapError(error)
    const msg =
      mapped.status === 502 ? "Failed to load review patterns." : mapped.message
    return jsonError(msg, mapped.status)
  }

  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (!res.ok) {
    const msg = parseCoachErrorMessage(data, "Failed to load review patterns.")
    return jsonError(msg, res.status >= 400 ? res.status : 502, res.headers)
  }

  const snapshot = parseCoachPatternsSnapshot(data)
  if (!snapshot.ok) {
    return jsonError(
      "Invalid coach patterns response from backend.",
      502,
      res.headers
    )
  }
  return { patterns: snapshot.value, headers: res.headers }
}

function isAbortOrTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const { name } = error as { name?: unknown }
  return name === "AbortError" || name === "TimeoutError"
}

function createSubmissionDebriefFetcher(
  request: NextRequest,
  signal: AbortSignal
): SubmissionDebriefFetcher {
  return async (challengeSlug, options) => {
    const origin = resolveInternalBackendOrigin(request)
    if (!origin) {
      throw new CoachToolError("Backend service origin could not be resolved.")
    }

    const fetchSignal =
      options?.abortSignal && options.abortSignal !== signal
        ? typeof AbortSignal.any === "function"
          ? AbortSignal.any([signal, options.abortSignal])
          : options.abortSignal
        : signal

    const url = `${origin}/api/user/coach-submissions/${encodeURIComponent(challengeSlug)}`
    let res: Response
    try {
      res = await fetch(url, {
        method: "GET",
        headers: buildCoachBackendHeaders(request),
        cache: "no-store",
        redirect: "error",
        signal: fetchSignal,
      })
    } catch (error) {
      if (fetchSignal.aborted || isAbortOrTimeoutError(error)) {
        throw error
      }
      throw new CoachToolError("Failed to load submission debrief.")
    }

    if (res.status === 404) {
      throw new CoachToolError("No prior submission found for this challenge.")
    }

    let data: unknown = null
    try {
      data = await res.json()
    } catch (error) {
      if (fetchSignal.aborted || isAbortOrTimeoutError(error)) {
        throw error
      }
      data = null
    }

    if (!res.ok) {
      throw new CoachToolError(
        parseCoachErrorMessage(data, "Failed to load submission debrief.")
      )
    }

    return data
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  if (isCrossSiteRequest(request)) {
    return noStoreJson({ error: "Cross-site requests are not allowed." }, 403)
  }
  const contentTypeError = requireJsonContentType(request)
  if (contentTypeError) return contentTypeError

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return noStoreJson({ error: "Invalid JSON request body." }, 400)
  }

  const parsed = parseCoachRequest(body)
  if (!parsed.ok) return noStoreJson({ error: parsed.message }, 400)

  const unsealed = unsealAICredential(
    request.cookies.get(BYOK_COOKIE_NAME)?.value
  )
  if (unsealed.status === "misconfigured") {
    return noStoreJson(
      { error: "AI connection service is not configured." },
      500
    )
  }
  if (unsealed.status === "missing" || unsealed.status === "invalid") {
    return noStoreJson({ error: MISSING_KEY_MESSAGE }, 401)
  }

  const timeoutSignal = AbortSignal.timeout(COACH_STREAM_TIMEOUT_MS)
  const abortSignal =
    typeof AbortSignal.any === "function"
      ? AbortSignal.any([request.signal, timeoutSignal])
      : request.signal
  const mapError = (error: unknown) =>
    mapProviderError(error, {
      timedOut: timeoutSignal.aborted,
      clientAborted: request.signal.aborted,
      abortMessage: ABORT_MESSAGE,
    })

  let promptInput: CoachPromptInput
  const upstreamHeaders: Headers[] = []
  let activeThreadId: string | undefined
  let degradationReason: CoachPersistenceDegradationReason | undefined

  if (parsed.value.mode === "patterns") {
    const fetched = await fetchPatterns(
      request,
      parsed.value,
      abortSignal,
      mapError
    )
    if (fetched instanceof Response) return fetched
    upstreamHeaders.push(fetched.headers)
    promptInput = {
      mode: "patterns",
      patterns: fetched.patterns,
      ...(parsed.value.debriefChallengeSlug
        ? { debriefChallengeSlug: parsed.value.debriefChallengeSlug }
        : {}),
    }

    if (parsed.value.threadId) {
      activeThreadId = parsed.value.threadId
    } else {
      const ensured = await ensureCoachThread({ request, abortSignal })
      if (ensured.headers) upstreamHeaders.push(ensured.headers)
      if (ensured.status === "created") {
        activeThreadId = ensured.threadId
      } else {
        degradationReason = ensured.reason
      }
    }
  } else {
    promptInput = { mode: "debrief", context: parsed.value.context }
  }

  try {
    const tools =
      parsed.value.mode === "patterns"
        ? createCoachTools({
            fetchSubmissionDebrief: createSubmissionDebriefFetcher(
              request,
              abortSignal
            ),
          })
        : createCoachTools()
    const windowedMessages = sliceCoachMessageWindow(parsed.value.messages)
    const modelMessages = await convertToModelMessages(windowedMessages, {
      tools,
    })
    const result = streamText({
      model: createBYOKModel(unsealed.credential),
      instructions: buildCoachSystemPrompt(promptInput),
      messages: modelMessages,
      tools,
      ...(parsed.value.mode === "debrief"
        ? {
            activeTools: [
              COACH_SUGGEST_DRILL_TOOL_NAME,
              COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
            ],
          }
        : {}),
      stopWhen: stepCountIs(COACH_MAX_STEPS),
      maxRetries: 0,
      abortSignal,
      experimental_transform: smoothStream({ chunking: "word" }),
    })

    const uiStream = toUIMessageStream({
      stream: result.stream,
      tools,
      sendReasoning: true,
      onError: (error) =>
        error instanceof CoachToolError
          ? error.message
          : mapError(error).message,
      ...(activeThreadId
        ? {
            originalMessages: parsed.value.messages,
            generateMessageId: () => crypto.randomUUID(),
            onEnd: async (event) => {
              await persistCoachTurn({
                request,
                threadId: activeThreadId,
                originalMessages: parsed.value.messages,
                event,
              })
            },
          }
        : {}),
    })
    const responseHeaders: Record<string, string> = {
      "Cache-Control": "no-store",
      Vary: "Cookie",
    }
    if (activeThreadId) {
      responseHeaders[COACH_THREAD_ID_HEADER] = activeThreadId
    }
    if (degradationReason) {
      responseHeaders[COACH_PERSISTENCE_HEADER] = degradationReason
    }
    const response = createUIMessageStreamResponse({
      stream: uiStream,
      headers: responseHeaders,
    })
    for (const headers of upstreamHeaders) {
      propagateBackendSetCookies(headers, response)
    }
    return response
  } catch (error) {
    const mapped = mapError(error)
    return jsonError(mapped.message, mapped.status, upstreamHeaders)
  }
}
