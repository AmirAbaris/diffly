import { type UIMessage } from "ai"
import { type NextRequest } from "next/server"

import {
  COACH_MAX_TEXT_PART_CHARS,
  COACH_MESSAGE_ID_REGEX,
  type CoachUIMessage,
} from "@/lib/ai/coach"
import {
  buildAllowlistedBackendCookieHeader,
  resolveInternalBackendOrigin,
} from "@/lib/server/backend-client"
import type { CoachPersistenceDegradationReason } from "@/types/coach-thread"

export const COACH_THREAD_ID_HEADER = "X-Coach-Thread-Id"
export const COACH_PERSISTENCE_HEADER = "X-Coach-Persistence"

const MAX_PARTS_PER_MESSAGE = 50
const MAX_PARTS_JSON_BYTES = 131_072
const MAX_JSON_DEPTH = 20
const PERSIST_TIMEOUT_MS = 5_000
const TOOL_NAME_REGEX = /^[A-Za-z0-9_-]+$/
const TERMINAL_TOOL_STATES = new Set([
  "output-available",
  "output-error",
  "output-denied",
])
const VALID_TOOL_STATES = new Set([
  "input-streaming",
  "input-available",
  "approval-requested",
  "approval-responded",
  ...TERMINAL_TOOL_STATES,
])
const STRIPPED_METADATA_KEYS = new Set([
  "providerMetadata",
  "callProviderMetadata",
])
const UTF8_ENCODER = new TextEncoder()

export type EnsureCoachThreadResult =
  | { status: "created"; threadId: string; headers: Headers }
  | {
      status: "ephemeral"
      reason: CoachPersistenceDegradationReason
      headers?: Headers
    }

export interface CoachStreamEndEvent {
  isAborted: boolean
  isCancelled?: boolean
  isContinuation: boolean
  outcome?: { status: string }
  responseMessage: Pick<UIMessage, "id" | "role" | "parts">
}

export interface PersistableCoachMessage {
  id: string
  role: "user" | "assistant"
  parts: Record<string, unknown>[]
}

export function buildCoachBackendHeaders(
  request: NextRequest
): Record<string, string> {
  const headers: Record<string, string> = {}
  const cookie = buildAllowlistedBackendCookieHeader(request.cookies.getAll())
  if (cookie) headers.cookie = cookie
  const auth = request.headers.get("authorization")
  if (auth && !/[\r\n\0]/.test(auth)) headers.authorization = auth
  return headers
}

export async function ensureCoachThread({
  request,
  abortSignal,
}: {
  request: NextRequest
  abortSignal?: AbortSignal
}): Promise<EnsureCoachThreadResult> {
  const origin = resolveInternalBackendOrigin(request)
  if (!origin) return { status: "ephemeral", reason: "upstream-error" }

  let res: Response
  try {
    res = await fetch(`${origin}/api/user/coach-threads`, {
      method: "POST",
      headers: {
        ...buildCoachBackendHeaders(request),
        "content-type": "application/json",
      },
      body: JSON.stringify({ mode: "patterns" }),
      cache: "no-store",
      redirect: "error",
      signal: abortSignal,
    })
  } catch {
    return { status: "ephemeral", reason: "upstream-error" }
  }

  if (res.status === 201) {
    try {
      const data = (await res.json()) as { id?: unknown } | null
      if (typeof data?.id === "string" && data.id.length > 0) {
        return { status: "created", threadId: data.id, headers: res.headers }
      }
    } catch {
      return {
        status: "ephemeral",
        reason: "upstream-error",
        headers: res.headers,
      }
    }
    return {
      status: "ephemeral",
      reason: "upstream-error",
      headers: res.headers,
    }
  }

  const reason: CoachPersistenceDegradationReason =
    res.status === 401
      ? "unauthenticated"
      : res.status === 409
        ? "quota-exceeded"
        : "upstream-error"
  return { status: "ephemeral", reason, headers: res.headers }
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

function isControlCode(code: number): boolean {
  return code <= 0x1f || code === 0x7f
}

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (isControlCode(value.charCodeAt(i))) return true
  }
  return false
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

function sanitizeMessage(
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

function hasTerminalToolPart(message: CoachUIMessage): boolean {
  return message.parts.some((part) => {
    const record = part as Record<string, unknown>
    return (
      typeof record.type === "string" &&
      record.type.startsWith("tool-") &&
      typeof record.state === "string" &&
      TERMINAL_TOOL_STATES.has(record.state)
    )
  })
}

export function buildPersistableTurnBatch(
  originalMessages: readonly CoachUIMessage[],
  event: CoachStreamEndEvent
): PersistableCoachMessage[] {
  if (
    event.isAborted ||
    event.isCancelled ||
    event.outcome?.status === "failed"
  ) {
    return []
  }

  const sanitizedResponse = sanitizeMessage(event.responseMessage, {
    requireMeaningfulAssistantContent: true,
  })
  if (!sanitizedResponse) return []
  if (event.isContinuation) return [sanitizedResponse]

  const batch: PersistableCoachMessage[] = []
  const seenIds = new Set<string>()
  const pushUnique = (msg: PersistableCoachMessage | null) => {
    if (!msg || seenIds.has(msg.id)) return
    seenIds.add(msg.id)
    batch.push(msg)
  }

  let lastUserIndex = -1
  for (let i = originalMessages.length - 1; i >= 0; i -= 1) {
    if (originalMessages[i]?.role === "user") {
      lastUserIndex = i
      break
    }
  }

  if (lastUserIndex > 0) {
    const preceding = originalMessages[lastUserIndex - 1]
    if (preceding?.role === "assistant" && hasTerminalToolPart(preceding)) {
      const sanitizedPreceding = sanitizeMessage(preceding)
      if (
        sanitizedPreceding &&
        sanitizedPreceding.id !== sanitizedResponse.id
      ) {
        pushUnique(sanitizedPreceding)
      }
    }
  }

  if (lastUserIndex >= 0) {
    const lastUser = originalMessages[lastUserIndex]
    const sanitizedUser = lastUser ? sanitizeMessage(lastUser) : null
    if (sanitizedUser && sanitizedUser.id !== sanitizedResponse.id) {
      pushUnique(sanitizedUser)
    }
  }

  pushUnique(sanitizedResponse)
  return batch
}

export async function persistCoachTurn({
  request,
  threadId,
  originalMessages,
  event,
}: {
  request: NextRequest
  threadId: string
  originalMessages: readonly CoachUIMessage[]
  event: CoachStreamEndEvent
}): Promise<void> {
  const batch = buildPersistableTurnBatch(originalMessages, event)
  if (batch.length === 0) return

  const origin = resolveInternalBackendOrigin(request)
  if (!origin) return

  try {
    await fetch(
      `${origin}/api/user/coach-threads/${encodeURIComponent(threadId)}/messages`,
      {
        method: "POST",
        headers: {
          ...buildCoachBackendHeaders(request),
          "content-type": "application/json",
        },
        body: JSON.stringify({ messages: batch }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(PERSIST_TIMEOUT_MS),
      }
    )
  } catch {
    return
  }
}
