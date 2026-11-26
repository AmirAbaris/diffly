import { DefaultChatTransport } from "ai"
import type { CoachUIMessage, DebriefContext } from "@/lib/ai/coach"
import { sliceCoachMessageWindow } from "@/lib/ai/coach-window"
import type { CoachPersistenceDegradationReason } from "@/types/coach-thread"

const COACH_THREAD_ID_HEADER = "X-Coach-Thread-Id"
const COACH_PERSISTENCE_HEADER = "X-Coach-Persistence"

export interface CoachQuickPrompt {
  readonly id: string
  readonly label: string
  readonly prompt: string
}

export const PATTERNS_QUICK_PROMPTS: readonly CoachQuickPrompt[] = [
  {
    id: "blind-spots",
    label: "Analyze my blind spots",
    prompt:
      "Analyze my review history and identify my biggest blind spots, weakest categories, and recurring failure modes.",
  },
  {
    id: "precision-recall",
    label: "Precision vs. recall",
    prompt:
      "Compare my precision and recall across languages and tell me what habit to change first.",
  },
  {
    id: "targeted-drill",
    label: "Generate targeted drill",
    prompt:
      "Based on my weakest review pattern, recommend one targeted practice drill using suggest_targeted_drill.",
  },
] as const

export const DEBRIEF_QUICK_PROMPTS: readonly CoachQuickPrompt[] = [
  {
    id: "missed-defects",
    label: "Why did I miss defects?",
    prompt:
      "Walk me through the defects I missed in this submission and what signal in the code should have caught my eye.",
  },
  {
    id: "review-flagged-lines",
    label: "Review my flagged lines",
    prompt:
      "Evaluate my flagged lines and critique against the staff benchmark. Where was I spot on and where did I over-flag?",
  },
  {
    id: "practice-similar-bug",
    label: "Practice similar bug",
    prompt:
      "Suggest a targeted follow-up drill for the core weakness exposed by this challenge using suggest_targeted_drill.",
  },
] as const

export const CREATE_CHALLENGE_PROMPT =
  "Create a custom code review challenge for me."

export type CoachTarget =
  | { mode: "patterns"; sliceLimit?: number; missedLimit?: number }
  | { mode: "debrief"; context: DebriefContext }

export interface CoachHistoryMutationResult {
  ok: boolean
  error?: string
}

export interface CoachHistoryMutationParams {
  targetMessageId: string
  messagesSnapshot: readonly CoachUIMessage[]
  requestEpoch: number
}

export interface CoachChatPersistenceAdapter {
  getThreadId: () => string | null
  getDebriefChallengeSlug?: () => string | null
  getSessionEpoch: () => number
  onThreadIdResolved: (threadId: string, requestEpoch: number) => void
  onPersistenceDegraded: (
    reason: CoachPersistenceDegradationReason,
    requestEpoch: number
  ) => void
  onTurnFinished?: (requestEpoch: number) => void
  prepareHistoryMutation?: (
    params: CoachHistoryMutationParams
  ) => Promise<CoachHistoryMutationResult>
}

export function buildCoachRequestBody(
  target: CoachTarget
): Record<string, unknown> {
  if (target.mode === "patterns") {
    return {
      mode: "patterns",
      sliceLimit: target.sliceLimit ?? 5,
      missedLimit: target.missedLimit ?? 10,
    }
  }
  return {
    mode: "debrief",
    context: target.context,
  }
}

function isPersistenceDegradationReason(
  value: string | null
): value is CoachPersistenceDegradationReason {
  return (
    value === "unauthenticated" ||
    value === "quota-exceeded" ||
    value === "upstream-error"
  )
}

export function createCoachChatTransport(target: CoachTarget) {
  let persistence: CoachChatPersistenceAdapter | undefined
  let lastRequestEpoch = 0

  const transport = new DefaultChatTransport<CoachUIMessage>({
    api: "/api/coach",
    prepareSendMessagesRequest: ({ messages: outbound, body }) => {
      const baseBody = buildCoachRequestBody(target)
      const threadId = persistence?.getThreadId()
      const debriefChallengeSlug =
        target.mode === "patterns"
          ? persistence?.getDebriefChallengeSlug?.()
          : null
      return {
        body: {
          ...baseBody,
          ...body,
          ...(threadId ? { threadId } : {}),
          ...(debriefChallengeSlug ? { debriefChallengeSlug } : {}),
          messages: sliceCoachMessageWindow(outbound),
        },
      }
    },
    fetch: async (input, init) => {
      const requestEpoch = persistence?.getSessionEpoch() ?? 0
      lastRequestEpoch = requestEpoch
      const response = await globalThis.fetch(input, init)
      if (persistence) {
        const resolvedThreadId = response.headers
          .get(COACH_THREAD_ID_HEADER)
          ?.trim()
        if (resolvedThreadId) {
          persistence.onThreadIdResolved(resolvedThreadId, requestEpoch)
        }
        const degradedHeader =
          response.headers.get(COACH_PERSISTENCE_HEADER)?.trim() ?? null
        if (isPersistenceDegradationReason(degradedHeader)) {
          persistence.onPersistenceDegraded(degradedHeader, requestEpoch)
        }
      }
      return response
    },
  })

  return {
    transport,
    setPersistence(next: CoachChatPersistenceAdapter | undefined) {
      persistence = next
    },
    notifyTurnFinished() {
      persistence?.onTurnFinished?.(lastRequestEpoch)
    },
  }
}
