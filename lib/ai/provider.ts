import { lookup } from "node:dns/promises"

import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { generateText, type LanguageModel } from "ai"

import { AI_PROVIDERS, type AIProviderId } from "@/lib/ai/catalog"
import {
  hasControlChars,
  isBlockedHostname,
  isBlockedIP,
  isProductionRuntime,
  MAX_API_KEY_LENGTH,
  MAX_MODEL_LENGTH,
  validateBaseUrl,
} from "@/lib/ai/url-validation"

export { AI_PROVIDERS, validateBaseUrl, type AIProviderId }

export interface SealedAICredential {
  provider: AIProviderId
  model: string
  apiKey: string
  baseUrl?: string
}

export type ParseCredentialResult =
  { ok: true; value: SealedAICredential } | { ok: false; message: string }

export type VerifyConnectionResult =
  { ok: true } | { ok: false; status: number; message: string }

const VERIFY_TIMEOUT_MS = 15_000
const MAX_ERROR_CAUSE_DEPTH = 5

export function createSafeFetch(): typeof fetch {
  return async (input, init) => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    const parsed = new URL(rawUrl)

    if (
      isProductionRuntime() &&
      process.env.BYOK_ALLOW_PRIVATE_BASE_URLS !== "true"
    ) {
      if (isBlockedHostname(parsed.hostname)) {
        throw new Error("Blocked private or metadata base URL.")
      }

      const records = await lookup(parsed.hostname, { all: true })
      for (const record of records) {
        if (isBlockedIP(record.address)) {
          throw new Error("Base URL resolved to a blocked IP address.")
        }
      }
    }

    return fetch(input, {
      ...init,
      redirect: "error",
    })
  }
}

const PROVIDER_FACTORIES: Record<
  AIProviderId,
  (credential: SealedAICredential) => LanguageModel
> = {
  google: (credential) =>
    createGoogleGenerativeAI({
      apiKey: credential.apiKey,
      fetch: createSafeFetch(),
      ...(credential.baseUrl ? { baseURL: credential.baseUrl } : {}),
    })(credential.model),
  openai: (credential) =>
    createOpenAI({
      apiKey: credential.apiKey,
      fetch: createSafeFetch(),
      ...(credential.baseUrl ? { baseURL: credential.baseUrl } : {}),
    })(credential.model),
  anthropic: (credential) =>
    createAnthropic({
      apiKey: credential.apiKey,
      fetch: createSafeFetch(),
      ...(credential.baseUrl ? { baseURL: credential.baseUrl } : {}),
    })(credential.model),
  "openai-compatible": (credential) =>
    createOpenAICompatible({
      name: "openai-compatible",
      apiKey: credential.apiKey,
      baseURL: credential.baseUrl ?? "",
      fetch: createSafeFetch(),
      supportsStructuredOutputs: true,
    })(credential.model),
}

export function isAIProviderId(value: unknown): value is AIProviderId {
  return (
    typeof value === "string" &&
    (AI_PROVIDERS as readonly string[]).includes(value)
  )
}

export function parseCredentialInput(body: unknown): ParseCredentialResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object." }
  }

  const record = body as Record<string, unknown>
  if (!isAIProviderId(record.provider)) {
    return { ok: false, message: "Unsupported AI provider." }
  }

  if (typeof record.model !== "string" || !record.model.trim()) {
    return { ok: false, message: "Model name is required." }
  }
  if (hasControlChars(record.model)) {
    return { ok: false, message: "Model name contains invalid characters." }
  }
  const model = record.model.trim()
  if (model.length > MAX_MODEL_LENGTH) {
    return {
      ok: false,
      message: `Model name must be at most ${MAX_MODEL_LENGTH} characters.`,
    }
  }

  if (typeof record.apiKey !== "string" || !record.apiKey.trim()) {
    return { ok: false, message: "API key is required." }
  }
  if (hasControlChars(record.apiKey)) {
    return { ok: false, message: "API key contains invalid characters." }
  }
  const apiKey = record.apiKey.trim()
  if (apiKey.length > MAX_API_KEY_LENGTH) {
    return {
      ok: false,
      message: `API key must be at most ${MAX_API_KEY_LENGTH} characters.`,
    }
  }

  const baseUrlResult = validateBaseUrl(
    record.baseUrl,
    record.provider === "openai-compatible"
  )
  if (!baseUrlResult.ok) {
    return baseUrlResult
  }

  return {
    ok: true,
    value: {
      provider: record.provider,
      model,
      apiKey,
      ...(baseUrlResult.value ? { baseUrl: baseUrlResult.value } : {}),
    },
  }
}

export function sanitizeCredential(value: unknown): ParseCredentialResult {
  return parseCredentialInput(value)
}

export function createBYOKModel(credential: SealedAICredential): LanguageModel {
  const sanitized = sanitizeCredential(credential)
  if (!sanitized.ok) {
    throw new Error(sanitized.message)
  }

  return PROVIDER_FACTORIES[sanitized.value.provider](sanitized.value)
}

function extractErrorStatus(error: unknown, depth = 0): number | undefined {
  if (!error || typeof error !== "object" || depth > MAX_ERROR_CAUSE_DEPTH) {
    return undefined
  }

  const record = error as Record<string, unknown>
  if (typeof record.statusCode === "number") return record.statusCode
  if (typeof record.status === "number") return record.status
  if (record.cause) return extractErrorStatus(record.cause, depth + 1)
  return undefined
}

function isAbortOrTimeoutError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > MAX_ERROR_CAUSE_DEPTH) {
    return false
  }

  const record = error as { name?: unknown; cause?: unknown }
  if (record.name === "AbortError" || record.name === "TimeoutError") {
    return true
  }
  return record.cause ? isAbortOrTimeoutError(record.cause, depth + 1) : false
}

export function mapProviderError(
  error: unknown,
  options: {
    timedOut?: boolean
    clientAborted?: boolean
    abortMessage?: string
  } = {}
): { status: number; message: string } {
  if (options.clientAborted && !options.timedOut) {
    return {
      status: 499,
      message: options.abortMessage ?? "Connection verification was cancelled.",
    }
  }

  if (options.timedOut || isAbortOrTimeoutError(error)) {
    return { status: 504, message: "Provider connection timed out." }
  }

  const statusCode = extractErrorStatus(error)
  if (statusCode === 400) {
    return {
      status: 400,
      message:
        "Invalid request to AI provider. Check your model, API key, and base URL.",
    }
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      status: 401,
      message: "Authentication failed. Check your API key and permissions.",
    }
  }

  if (statusCode === 404) {
    return {
      status: 400,
      message: "Model or endpoint not found. Check your model and base URL.",
    }
  }

  if (statusCode === 429) {
    return {
      status: 429,
      message: "Provider rate limit exceeded. Please try again shortly.",
    }
  }

  return {
    status: 502,
    message: "Failed to connect to the AI provider.",
  }
}

export async function verifyBYOKConnection(
  credential: SealedAICredential,
  options?: { signal?: AbortSignal }
): Promise<VerifyConnectionResult> {
  const timeoutSignal = AbortSignal.timeout(VERIFY_TIMEOUT_MS)
  const abortSignal =
    options?.signal && typeof AbortSignal.any === "function"
      ? AbortSignal.any([options.signal, timeoutSignal])
      : (options?.signal ?? timeoutSignal)

  try {
    await generateText({
      model: createBYOKModel(credential),
      prompt: "Reply with ok.",
      maxOutputTokens: 16,
      maxRetries: 0,
      abortSignal,
    })
    return { ok: true }
  } catch (error) {
    const mapped = mapProviderError(error, {
      timedOut: timeoutSignal.aborted,
      clientAborted: Boolean(options?.signal?.aborted),
    })
    return { ok: false, status: mapped.status, message: mapped.message }
  }
}
