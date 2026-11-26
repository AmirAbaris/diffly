import {
  COACH_MAX_REQUEST_MESSAGES,
  COACH_MAX_TEXT_PART_CHARS,
  COACH_MESSAGE_ID_REGEX,
  type CoachUIMessage,
} from "@/lib/ai/coach"

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

function clampTextLikeParts(message: CoachUIMessage): CoachUIMessage {
  let changed = false
  const parts = message.parts.map((part) => {
    if (
      (part.type === "text" || part.type === "reasoning") &&
      typeof part.text === "string" &&
      part.text.length > COACH_MAX_TEXT_PART_CHARS
    ) {
      changed = true
      return {
        ...part,
        text: part.text.slice(0, COACH_MAX_TEXT_PART_CHARS),
      }
    }
    return part
  })
  return changed
    ? { ...message, parts: parts as CoachUIMessage["parts"] }
    : message
}

export function sliceCoachMessageWindow(
  messages: readonly CoachUIMessage[],
  maxMessages = COACH_MAX_REQUEST_MESSAGES
): CoachUIMessage[] {
  if (maxMessages <= 0 || messages.length === 0) {
    return []
  }

  let windowed =
    messages.length > maxMessages ? messages.slice(-maxMessages) : [...messages]

  const firstUserIndex = windowed.findIndex((msg) => msg.role === "user")
  if (firstUserIndex > 0) {
    windowed = windowed.slice(firstUserIndex)
  }

  return windowed.map(clampTextLikeParts)
}

function isValidHydratedPart(
  role: "user" | "assistant",
  part: unknown
): part is Record<string, unknown> {
  if (!part || typeof part !== "object" || Array.isArray(part)) {
    return false
  }
  const record = part as Record<string, unknown>
  const { type } = record
  if (typeof type !== "string" || !type) {
    return false
  }

  if (role === "user") {
    return type === "text" && typeof record.text === "string"
  }

  if (type === "text" || type === "reasoning") {
    return typeof record.text === "string"
  }
  if (type === "step-start") {
    return true
  }
  if (type.startsWith("tool-") && TOOL_NAME_REGEX.test(type.slice(5))) {
    return (
      typeof record.toolCallId === "string" &&
      record.toolCallId.trim().length > 0 &&
      typeof record.state === "string" &&
      VALID_TOOL_STATES.has(record.state)
    )
  }

  return false
}

export interface HydratedCoachThread {
  messages: CoachUIMessage[]
  sequenceByMessageId: Record<string, number>
}

export function hydrateCoachThreadWithSequences(
  raw: unknown
): HydratedCoachThread {
  if (!Array.isArray(raw)) {
    return { messages: [], sequenceByMessageId: {} }
  }

  const valid: Array<{
    sequence: number
    index: number
    message: CoachUIMessage
  }> = []

  raw.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return
    }
    const record = item as Record<string, unknown>
    const { id, role, parts, sequence } = record
    if (typeof id !== "string" || !COACH_MESSAGE_ID_REGEX.test(id)) {
      return
    }
    if (role !== "user" && role !== "assistant") {
      return
    }
    if (
      typeof sequence !== "number" ||
      !Number.isInteger(sequence) ||
      sequence < 0
    ) {
      return
    }
    if (!Array.isArray(parts) || parts.length === 0) {
      return
    }

    const validParts = parts.filter((part) => isValidHydratedPart(role, part))
    if (validParts.length === 0) {
      return
    }

    valid.push({
      sequence,
      index,
      message: {
        id,
        role,
        parts: validParts as CoachUIMessage["parts"],
      },
    })
  })

  valid.sort((a, b) => a.sequence - b.sequence || a.index - b.index)
  const sequenceByMessageId: Record<string, number> = {}
  const messages: CoachUIMessage[] = []
  for (const entry of valid) {
    messages.push(entry.message)
    sequenceByMessageId[entry.message.id] = entry.sequence
  }
  return { messages, sequenceByMessageId }
}

export function hydrateCoachThreadMessages(raw: unknown): CoachUIMessage[] {
  return hydrateCoachThreadWithSequences(raw).messages
}
