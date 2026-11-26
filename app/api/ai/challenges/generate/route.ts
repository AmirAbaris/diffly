import { NextRequest, NextResponse } from "next/server"

import {
  generateCustomChallengeWithAI,
  MAX_GENERATION_ATTEMPTS,
  parseGenerateChallengePayload,
} from "@/lib/ai/challenge-generation"
import { BYOK_COOKIE_NAME, unsealAICredential } from "@/lib/ai/cookie"
import {
  isCrossSiteRequest,
  noStoreJson,
  requireJsonContentType,
} from "@/lib/ai/http"
import {
  buildAllowlistedBackendCookieHeader,
  propagateBackendSetCookies,
  resolveInternalBackendOrigin,
} from "@/lib/server/backend-client"

export const maxDuration = 60
export const REQUEST_DEADLINE_MS = 52_000

const GENERIC_CONFIG_ERROR = "AI connection service is not configured."
const MISSING_CONNECTION_ERROR =
  "No active AI provider connection. Configure your API key in Settings."
const DEFAULT_QUOTA_LIMIT = 5

interface CustomQuotaSummary {
  total?: unknown
  quota_limit?: unknown
  quota_remaining?: unknown
}

function errorJson(
  message: string,
  status: number,
  ...upstreamHeaders: Array<Headers | undefined>
): NextResponse {
  const response = noStoreJson({ error: message, detail: message }, status)
  for (const headers of upstreamHeaders) {
    if (headers) {
      propagateBackendSetCookies(headers, response)
    }
  }
  return response
}

function buildBackendHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {}
  const cookieHeader = buildAllowlistedBackendCookieHeader(
    request.cookies.getAll()
  )
  if (cookieHeader) {
    headers.cookie = cookieHeader
  }

  const authorization = request.headers.get("authorization")
  if (authorization && !/[\r\n\0]/.test(authorization)) {
    headers.authorization = authorization
  }

  return headers
}

async function extractBackendErrorDetail(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const data: unknown = await response.json()
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>
      if (typeof record.detail === "string" && record.detail.trim()) {
        return record.detail.trim()
      }
      if (Array.isArray(record.detail) && record.detail.length > 0) {
        const first = record.detail[0]
        if (
          first &&
          typeof first === "object" &&
          typeof (first as Record<string, unknown>).msg === "string"
        ) {
          const msg = ((first as Record<string, unknown>).msg as string).trim()
          if (msg) {
            return msg
          }
        }
      }
      if (typeof record.error === "string" && record.error.trim()) {
        return record.error.trim()
      }
    }
  } catch {
    // Upstream error body may not be JSON.
  }

  return fallback
}

function formatQuotaReachedMessage(quotaLimit: number): string {
  return (
    `Quota limit reached. You can have at most ${quotaLimit} custom challenges. ` +
    "Please delete an existing custom challenge to create a new one."
  )
}

interface GenerationAttemptContext {
  credential: Parameters<typeof generateCustomChallengeWithAI>[0]
  payload: Extract<
    ReturnType<typeof parseGenerateChallengePayload>,
    { ok: true }
  >["value"]
  backendOrigin: string
  backendHeaders: Record<string, string>
  quotaHeaders: Headers
  signal: AbortSignal
  clientSignal: AbortSignal
  deadlineSignal: AbortSignal
}

async function runGenerationAttempt(
  ctx: GenerationAttemptContext,
  attempt: number
): Promise<NextResponse> {
  const generated = await generateCustomChallengeWithAI(
    ctx.credential,
    ctx.payload,
    { signal: ctx.signal, clientSignal: ctx.clientSignal }
  )

  if (!generated.ok) {
    if (
      generated.retryable === true &&
      attempt < MAX_GENERATION_ATTEMPTS &&
      !ctx.signal.aborted
    ) {
      return runGenerationAttempt(ctx, attempt + 1)
    }
    return errorJson(generated.message, generated.status, ctx.quotaHeaders)
  }

  let persistRes: Response
  try {
    persistRes = await fetch(`${ctx.backendOrigin}/api/challenges/custom`, {
      method: "POST",
      headers: {
        ...ctx.backendHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...generated.data,
        ...ctx.payload,
      }),
      cache: "no-store",
      signal: ctx.signal,
    })
  } catch {
    if (ctx.clientSignal.aborted && !ctx.deadlineSignal.aborted) {
      return errorJson(
        "Challenge generation was cancelled.",
        499,
        ctx.quotaHeaders
      )
    }
    if (ctx.deadlineSignal.aborted) {
      return errorJson("Provider connection timed out.", 504, ctx.quotaHeaders)
    }
    return errorJson("Failed to save custom challenge.", 502, ctx.quotaHeaders)
  }

  if (persistRes.status === 422) {
    const detail = await extractBackendErrorDetail(
      persistRes,
      "Generated challenge failed validation."
    )
    if (attempt < MAX_GENERATION_ATTEMPTS && !ctx.signal.aborted) {
      return runGenerationAttempt(ctx, attempt + 1)
    }
    return errorJson(detail, 502, ctx.quotaHeaders, persistRes.headers)
  }

  if (!persistRes.ok) {
    const detail = await extractBackendErrorDetail(
      persistRes,
      "Failed to save custom challenge."
    )
    return errorJson(
      detail,
      persistRes.status >= 400 ? persistRes.status : 502,
      ctx.quotaHeaders,
      persistRes.headers
    )
  }

  let persistedData: unknown
  try {
    persistedData = await persistRes.json()
  } catch {
    return errorJson(
      "Invalid response from backend service.",
      502,
      ctx.quotaHeaders,
      persistRes.headers
    )
  }

  const response = noStoreJson(persistedData, persistRes.status)
  propagateBackendSetCookies(ctx.quotaHeaders, response)
  propagateBackendSetCookies(persistRes.headers, response)
  return response
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) {
    return errorJson("Cross-site requests are not allowed.", 403)
  }

  const contentTypeError = requireJsonContentType(request)
  if (contentTypeError) {
    return errorJson("Content-Type must be application/json.", 415)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorJson("Invalid JSON request body.", 400)
  }

  const parsed = parseGenerateChallengePayload(body)
  if (!parsed.ok) {
    return errorJson(parsed.message, 400)
  }

  const rawCookie = request.cookies.get(BYOK_COOKIE_NAME)?.value
  const unsealed = unsealAICredential(rawCookie)
  if (unsealed.status === "misconfigured") {
    return errorJson(GENERIC_CONFIG_ERROR, 500)
  }
  if (unsealed.status === "missing" || unsealed.status === "invalid") {
    return errorJson(MISSING_CONNECTION_ERROR, 401)
  }

  const backendOrigin = resolveInternalBackendOrigin(request)
  if (!backendOrigin) {
    return errorJson("Backend service origin could not be resolved.", 502)
  }

  const backendHeaders = buildBackendHeaders(request)
  const deadlineSignal = AbortSignal.timeout(REQUEST_DEADLINE_MS)
  const sharedSignal =
    typeof AbortSignal.any === "function"
      ? AbortSignal.any([request.signal, deadlineSignal])
      : request.signal

  let quotaRes: Response
  try {
    quotaRes = await fetch(`${backendOrigin}/api/challenges/custom`, {
      method: "GET",
      headers: backendHeaders,
      cache: "no-store",
      signal: sharedSignal,
    })
  } catch {
    if (request.signal.aborted && !deadlineSignal.aborted) {
      return errorJson("Challenge generation was cancelled.", 499)
    }
    if (deadlineSignal.aborted) {
      return errorJson("Provider connection timed out.", 504)
    }
    return errorJson("Failed to check custom challenge quota.", 502)
  }

  if (!quotaRes.ok) {
    const detail = await extractBackendErrorDetail(
      quotaRes,
      "Failed to check custom challenge quota."
    )
    return errorJson(
      detail,
      quotaRes.status >= 400 ? quotaRes.status : 502,
      quotaRes.headers
    )
  }

  let quotaData: CustomQuotaSummary
  try {
    quotaData = (await quotaRes.json()) as CustomQuotaSummary
  } catch {
    return errorJson(
      "Invalid quota response from backend service.",
      502,
      quotaRes.headers
    )
  }

  const quotaLimit =
    typeof quotaData.quota_limit === "number"
      ? quotaData.quota_limit
      : DEFAULT_QUOTA_LIMIT
  const isQuotaFull =
    (typeof quotaData.quota_remaining === "number" &&
      quotaData.quota_remaining <= 0) ||
    (typeof quotaData.total === "number" && quotaData.total >= quotaLimit)

  if (isQuotaFull) {
    return errorJson(
      formatQuotaReachedMessage(quotaLimit),
      400,
      quotaRes.headers
    )
  }

  return runGenerationAttempt(
    {
      credential: unsealed.credential,
      payload: parsed.value,
      backendOrigin,
      backendHeaders,
      quotaHeaders: quotaRes.headers,
      signal: sharedSignal,
      clientSignal: request.signal,
      deadlineSignal,
    },
    1
  )
}
