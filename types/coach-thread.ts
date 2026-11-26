import type { CoachMode } from "@/lib/ai/coach"

export type CoachPersistenceDegradationReason =
  "unauthenticated" | "quota-exceeded" | "upstream-error"

export interface CoachPersistenceNotice {
  reason: CoachPersistenceDegradationReason
  message: string
}

export interface CoachThreadSummary {
  id: string
  title: string
  mode: CoachMode
  challenge_slug: string | null
  message_count: number
  created_at: string
  updated_at: string
}

export interface CoachThreadMessageRecord {
  id: string
  role: "user" | "assistant"
  parts: unknown[]
  sequence: number
  created_at: string
}

export interface CoachThreadDetail extends CoachThreadSummary {
  messages: CoachThreadMessageRecord[]
}

export interface CoachThreadListResponse {
  items: CoachThreadSummary[]
  total: number
}

export interface TruncateCoachMessagesResponse {
  deleted_count: number
  remaining_count: number
}

export type CoachThreadSessionState =
  | { kind: "fresh" }
  | { kind: "loading"; threadId: string }
  | {
      kind: "active"
      threadId: string
      mode?: CoachMode
      challengeSlug?: string | null
    }
  | { kind: "ephemeral"; reason: CoachPersistenceDegradationReason }
  | { kind: "error"; threadId: string; status?: number; message: string }
