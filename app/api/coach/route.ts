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
  COACH_MAX_STEPS,
  COACH_STREAM_TIMEOUT_MS,
  type CoachPatternsSnapshot,
  type CoachPromptInput,
  createCoachTools,
  parseCoachErrorMessage,
  parseCoachPatternsSnapshot,
  parseCoachRequest,
  type PatternsCoachRequest,
} from "@/lib/ai/coach"
import { BYOK_COOKIE_NAME, unsealAICredential } from "@/lib/ai/cookie"
import {
  isCrossSiteRequest,
  noStoreJson,
  requireJsonContentType,
} from "@/lib/ai/http"
import { createBYOKModel, mapProviderError } from "@/lib/ai/provider"
import {
  buildAllowlistedBackendCookieHeader,
  propagateBackendSetCookies,
  resolveInternalBackendOrigin,
} from "@/lib/server/backend-client"

export const maxDuration = 60

const ABORT_MESSAGE = "Coach response was cancelled."
const MISSING_KEY_MESSAGE =
  "No active AI provider connection. Configure your API key in Settings."

function jsonError(
  msg: string,
  status: number,
  upstream?: Headers
): NextResponse {
  const res = noStoreJson({ error: msg }, status)
  if (upstream) propagateBackendSetCookies(upstream, res)
  return res
}

function buildBackendHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {}
  const cookie = buildAllowlistedBackendCookieHeader(request.cookies.getAll())
  if (cookie) headers.cookie = cookie
  const auth = request.headers.get("authorization")
  if (auth && !/[\r\n\0]/.test(auth)) headers.authorization = auth
  return headers
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
      headers: buildBackendHeaders(request),
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
  let upstreamHeaders: Headers | undefined
  if (parsed.value.mode === "patterns") {
    const fetched = await fetchPatterns(
      request,
      parsed.value,
      abortSignal,
      mapError
    )
    if (fetched instanceof Response) return fetched
    upstreamHeaders = fetched.headers
    promptInput = { mode: "patterns", patterns: fetched.patterns }
  } else {
    promptInput = { mode: "debrief", context: parsed.value.context }
  }

  try {
    const tools = createCoachTools()
    const modelMessages = await convertToModelMessages(parsed.value.messages, {
      tools,
    })
    const result = streamText({
      model: createBYOKModel(unsealed.credential),
      instructions: buildCoachSystemPrompt(promptInput),
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(COACH_MAX_STEPS),
      maxRetries: 0,
      abortSignal,
      experimental_transform: smoothStream({ chunking: "word" }),
    })

    const uiStream = toUIMessageStream({
      stream: result.stream,
      tools,
      sendReasoning: true,
      onError: (error) => mapError(error).message,
    })
    const response = createUIMessageStreamResponse({
      stream: uiStream,
      headers: { "Cache-Control": "no-store", Vary: "Cookie" },
    })
    if (upstreamHeaders) propagateBackendSetCookies(upstreamHeaders, response)
    return response
  } catch (error) {
    const mapped = mapError(error)
    return jsonError(mapped.message, mapped.status, upstreamHeaders)
  }
}
