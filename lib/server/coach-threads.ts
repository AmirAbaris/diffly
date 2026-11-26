import { type UIMessage } from "ai"
import { type NextRequest } from "next/server"

import type { CoachUIMessage } from "@/lib/ai/coach"
import {
  sanitizeCoachMessage,
  type PersistableCoachMessage,
} from "@/lib/ai/coach-serialize"
import {
  buildAllowlistedBackendCookieHeader,
  resolveInternalBackendOrigin,
} from "@/lib/server/backend-client"
import type { CoachPersistenceDegradationReason } from "@/types/coach-thread"

export type { PersistableCoachMessage }

export const COACH_THREAD_ID_HEADER = "X-Coach-Thread-Id"
export const COACH_PERSISTENCE_HEADER = "X-Coach-Persistence"

const PERSIST_TIMEOUT_MS = 5_000
const TERMINAL_TOOL_STATES = new Set([
  "output-available",
  "output-error",
  "output-denied",
])

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

  const sanitizedResponse = sanitizeCoachMessage(event.responseMessage, {
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
      const sanitizedPreceding = sanitizeCoachMessage(preceding)
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
    const sanitizedUser = lastUser ? sanitizeCoachMessage(lastUser) : null
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
