import type { UIMessage } from "ai"

import {
  COACH_MAX_TEXT_PART_CHARS,
  COACH_MESSAGE_ID_REGEX,
} from "@/lib/ai/coach-schemas"

export const COACH_APPEND_MAX_BATCH_SIZE = 20

const MAX_PARTS_PER_MESSAGE = 50
const MAX_PARTS_JSON_BYTES = 131_072
const MAX_JSON_DEPTH = 20
const MAX_CHALLENGE_SLUG_LENGTH = 200
const MAX_HANDOFF_TITLE_LENGTH = 120
const TOOL_NAME_REGEX = /^[A-Za-z0-9_-]+$/
const VALID_TOOL_STATES = new Set([
  "input-streaming",
  "input-available",
  "approval-requested",
  "approval-responded",
  "output-available",
  "output-error",
  "output-denied",
])
const STRIPPED_METADATA_KEYS = new Set([
  "providerMetadata",
  "callProviderMetadata",
])
const UTF8_ENCODER = new TextEncoder()

export interface PersistableCoachMessage {
  id: string
  role: "user" | "assistant"
  parts: Record<string, unknown>[]
}

function isControlCode(code: number): boolean {
  return code <= 0x1f || code === 0x7f
}

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (isControlCode(value.charCodeAt(i))) return true
  }
  return false
}

function stripControlCharacters(value: string): string {
  let out = ""
  for (let i = 0; i < value.length; i += 1) {
    if (!isControlCode(value.charCodeAt(i))) {
      out += value[i]
    }
  }
  return out
}

function hasPrintableNonWhitespace(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]
    if (!isControlCode(value.charCodeAt(i)) && !/\s/.test(ch)) {
      return true
    }
  }
  return false
}

function sanitizeJsonValue(value: unknown, depth: number): unknown {
  if (depth > MAX_JSON_DEPTH) return undefined
  if (value === null || typeof value === "boolean") return value
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined
  if (typeof value === "string") return value.replaceAll("\0", "")
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeJsonValue(item, depth + 1))
      .filter((item) => item !== undefined)
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [rawKey, rawVal] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (STRIPPED_METADATA_KEYS.has(rawKey)) continue
      const cleaned = sanitizeJsonValue(rawVal, depth + 1)
      if (cleaned !== undefined) out[rawKey.replaceAll("\0", "")] = cleaned
    }
    return out
  }
  return undefined
}

function sanitizeUserPart(part: unknown): Record<string, unknown> | null {
  if (!part || typeof part !== "object" || Array.isArray(part)) return null
  const record = part as Record<string, unknown>
  if (record.type !== "text" || typeof record.text !== "string") return null
  const text = record.text
    .replaceAll("\0", "")
    .slice(0, COACH_MAX_TEXT_PART_CHARS)
  return hasPrintableNonWhitespace(text) ? { type: "text", text } : null
}

function sanitizeAssistantPart(part: unknown): Record<string, unknown> | null {
  if (!part || typeof part !== "object" || Array.isArray(part)) return null
  const record = part as Record<string, unknown>
  const { type } = record
  if (typeof type !== "string" || !type) return null

  if (type === "text" || type === "reasoning") {
    if (typeof record.text !== "string") return null
    const sanitized = sanitizeJsonValue(record, 1) as Record<string, unknown>
    const text = record.text
      .replaceAll("\0", "")
      .slice(0, COACH_MAX_TEXT_PART_CHARS)
    return { ...sanitized, type, text }
  }
  if (type === "step-start") return { type: "step-start" }
  if (type.startsWith("tool-") && TOOL_NAME_REGEX.test(type.slice(5))) {
    const { toolCallId, state } = record
    if (
      typeof toolCallId !== "string" ||
      toolCallId.length > 200 ||
      toolCallId.trim().length === 0 ||
      hasControlChar(toolCallId) ||
      typeof state !== "string" ||
      !VALID_TOOL_STATES.has(state)
    ) {
      return null
    }
    const sanitized = sanitizeJsonValue(record, 1) as Record<string, unknown>
    return { ...sanitized, type, toolCallId, state }
  }
  return null
}

function hasMeaningfulAssistantContent(
  parts: readonly Record<string, unknown>[]
): boolean {
  return parts.some((part) => {
    if (part.type === "text" || part.type === "reasoning") {
      return typeof part.text === "string" && part.text.trim().length > 0
    }
    return typeof part.type === "string" && part.type.startsWith("tool-")
  })
}

function fitPartsWithinByteBudget(
  parts: Record<string, unknown>[]
): Record<string, unknown>[] {
  const bounded = parts.slice(0, MAX_PARTS_PER_MESSAGE)
  while (
    bounded.length > 0 &&
    UTF8_ENCODER.encode(JSON.stringify(bounded)).byteLength >
      MAX_PARTS_JSON_BYTES
  ) {
    bounded.pop()
  }
  return bounded
}

export function sanitizeCoachMessage(
  message: Pick<UIMessage, "id" | "role" | "parts">,
  options?: { requireMeaningfulAssistantContent?: boolean }
): PersistableCoachMessage | null {
  if (message.role !== "user" && message.role !== "assistant") return null
  if (!Array.isArray(message.parts) || message.parts.length === 0) return null

  const sanitizedParts: Record<string, unknown>[] = []
  for (const part of message.parts) {
    const cleaned =
      message.role === "user"
        ? sanitizeUserPart(part)
        : sanitizeAssistantPart(part)
    if (cleaned) sanitizedParts.push(cleaned)
  }

  const fitted = fitPartsWithinByteBudget(sanitizedParts)
  if (fitted.length === 0) return null
  if (
    message.role === "assistant" &&
    options?.requireMeaningfulAssistantContent &&
    !hasMeaningfulAssistantContent(fitted)
  ) {
    return null
  }

  const id =
    typeof message.id === "string" && COACH_MESSAGE_ID_REGEX.test(message.id)
      ? message.id
      : crypto.randomUUID()
  return { id, role: message.role, parts: fitted }
}

export function serializeCoachMessagesForAppend(
  messages: readonly Pick<UIMessage, "id" | "role" | "parts">[]
): PersistableCoachMessage[] {
  const result: PersistableCoachMessage[] = []
  const seenIds = new Set<string>()
  for (const message of messages) {
    const sanitized = sanitizeCoachMessage(message)
    if (!sanitized || seenIds.has(sanitized.id)) continue
    seenIds.add(sanitized.id)
    result.push(sanitized)
  }
  return result
}

export function chunkMessagesForAppend<T>(
  messages: readonly T[],
  maxBatchSize = COACH_APPEND_MAX_BATCH_SIZE
): T[][] {
  const size = Math.max(1, Math.floor(maxBatchSize))
  const chunks: T[][] = []
  for (let i = 0; i < messages.length; i += size) {
    chunks.push(messages.slice(i, i + size))
  }
  return chunks
}

export function sanitizeChallengeSlug(raw?: string | null): string | null {
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_CHALLENGE_SLUG_LENGTH ||
    hasControlChar(trimmed) ||
    /[\s/\\]/.test(trimmed)
  ) {
    return null
  }
  return trimmed
}

export function buildDebriefHandoffTitle(
  challengeTitle?: string,
  challengeSlug?: string
): string {
  const cleanedTitle =
    typeof challengeTitle === "string"
      ? stripControlCharacters(challengeTitle).replace(/\s+/g, " ").trim()
      : ""
  const safeSlug = sanitizeChallengeSlug(challengeSlug) ?? ""
  const label = cleanedTitle || safeSlug
  const raw = label ? `Debrief: ${label}` : "Debrief"
  return raw.slice(0, MAX_HANDOFF_TITLE_LENGTH).trim() || "Debrief"
}

export function buildDebriefHandoffPrompt(
  challengeSlug: string,
  challengeTitle?: string
): string {
  const safeSlug = sanitizeChallengeSlug(challengeSlug) ?? "challenge"
  const cleanedTitle =
    typeof challengeTitle === "string"
      ? stripControlCharacters(challengeTitle).replace(/\s+/g, " ").trim()
      : ""
  const target = cleanedTitle
    ? `"${cleanedTitle}" (${safeSlug})`
    : `challenge "${safeSlug}"`
  return `Debrief my submission on ${target}. Call get_submission_debrief with challenge_slug "${safeSlug}" and walk me through what I caught, what I missed, and what pattern to practice next.`
}
