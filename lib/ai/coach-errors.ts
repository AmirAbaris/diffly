import axios from "axios"

import { isRequestTimeoutError } from "@/hooks/use-custom-challenges"

function unwrapErrorPayload(value: unknown, depth = 0): string | null {
  if (depth > 3 || value === null || value === undefined) return null
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        return unwrapErrorPayload(JSON.parse(trimmed), depth + 1) ?? trimmed
      } catch {
        return trimmed
      }
    }
    return trimmed
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    if (Array.isArray(record.detail) && record.detail.length > 0) {
      const msg = (record.detail[0] as { msg?: unknown } | undefined)?.msg
      if (typeof msg === "string" && msg.trim()) return msg.trim()
    }
    for (const candidate of [record.detail, record.error, record.message]) {
      const extracted = unwrapErrorPayload(candidate, depth + 1)
      if (extracted) return extracted
    }
  }
  return null
}

export function parseCoachErrorMessage(
  error: unknown,
  fallback = "Failed to reach the AI coach. Please try again."
): string {
  return unwrapErrorPayload(error) ?? fallback
}

export function resolveChallengeGenerationError(err: unknown): string {
  if (isRequestTimeoutError(err)) {
    return "Generation timed out. Check your custom library in the sidebar in case it finished."
  }
  if (axios.isAxiosError(err)) {
    const fromData = parseCoachErrorMessage(err.response?.data, "")
    if (fromData) return fromData
    if (err.response?.status === 401) {
      return "AI provider authentication failed. Check your API key in Settings."
    }
    if (err.response?.status === 429) {
      return "AI provider rate limit reached. Please wait a moment and try again."
    }
    if (err.response?.status === 400) {
      return "Quota limit reached. Delete a custom challenge in the sidebar first."
    }
  }
  return parseCoachErrorMessage(
    err,
    "Failed to generate challenge. Please try again."
  )
}
