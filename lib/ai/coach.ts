import { tool, type InferUITools, type UIDataTypes, type UIMessage } from "ai"
import { z } from "zod"

import {
  COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
  ConfigureChallengeInputSchema,
  ConfigureChallengeOutputSchema,
  matchChoice,
  stripControlChars,
} from "@/lib/ai/coach-challenge-config"
import type {
  CoachPatternsSnapshot,
  DebriefContext,
} from "@/lib/ai/coach-prompts"
import {
  COACH_MESSAGE_ID_REGEX,
  COACH_SUGGEST_DRILL_TOOL_NAME,
  CoachPatternsSnapshotSchema,
  CoachRequestSchema,
} from "@/lib/ai/coach-schemas"
import {
  COACH_GET_SUBMISSION_DEBRIEF_TOOL_NAME,
  CoachToolError,
  createSubmissionDebriefTool,
  type SubmissionDebriefFetcher,
} from "@/lib/ai/coach-submission-debrief"
import { hasControlChars } from "@/lib/ai/url-validation"
import {
  CHALLENGE_DIFFICULTIES,
  CHALLENGE_LANGUAGES,
  type Difficulty,
  type Language,
} from "@/types/challenge"

export * from "@/lib/ai/coach-challenge-config"
export { parseCoachErrorMessage } from "@/lib/ai/coach-errors"
export * from "@/lib/ai/coach-prompts"
export * from "@/lib/ai/coach-schemas"
export * from "@/lib/ai/coach-submission-debrief"

export type CoachMode = "patterns" | "debrief"
export const COACH_MAX_STEPS = 3
export const COACH_STREAM_TIMEOUT_MS = 50_000

const LANGUAGES = CHALLENGE_LANGUAGES.map((l) => l.value) as [
  Language,
  ...Language[],
]
const DIFFICULTIES = [...CHALLENGE_DIFFICULTIES] as [
  Difficulty,
  ...Difficulty[],
]
const FORBIDDEN_KEYS = new Set([
  "userId",
  "user_id",
  "sessionId",
  "session_id",
  "patterns",
  "patternStats",
  "pattern_stats",
])

export type ParseResult<T> =
  { ok: true; value: T } | { ok: false; message: string }

export interface TargetedDrillSuggestion {
  topic: string
  language: Language
  difficulty: Difficulty
  rationale?: string
}

export interface CreateCoachToolsOptions {
  fetchSubmissionDebrief?: SubmissionDebriefFetcher
}

export function createCoachTools(options?: CreateCoachToolsOptions) {
  return {
    [COACH_SUGGEST_DRILL_TOOL_NAME]: tool({
      description:
        "Recommend one targeted code review practice drill tailored to the user's weakness or debrief topic.",
      inputSchema: z.object({
        topic: z.string().describe("Focused practice topic (3 to 200 chars)."),
        language: z.enum(LANGUAGES).describe("Target programming language."),
        difficulty: z.enum(DIFFICULTIES).describe("Target difficulty."),
        rationale: z.string().optional().describe("Why this drill helps."),
      }),
      execute: async (input): Promise<TargetedDrillSuggestion> => {
        const clamped = clampTargetedDrillSuggestion(input)
        if (!clamped.ok) throw new CoachToolError(clamped.message)
        return clamped.value
      },
    }),
    [COACH_CONFIGURE_CHALLENGE_TOOL_NAME]: tool({
      description:
        "Open an interactive 3-step challenge configuration wizard in chat to let the user pick language, difficulty, and focus topic, then generate the custom challenge inline. Supply 3-4 suggestedTopics grounded in their weak spots, and omit language, difficulty, and topic unless the user explicitly named them.",
      inputSchema: ConfigureChallengeInputSchema,
      outputSchema: ConfigureChallengeOutputSchema,
    }),
    [COACH_GET_SUBMISSION_DEBRIEF_TOOL_NAME]: createSubmissionDebriefTool(
      options?.fetchSubmissionDebrief
    ),
  }
}

export type CoachToolSet = ReturnType<typeof createCoachTools>
export type CoachUITools = InferUITools<CoachToolSet>
export type CoachUIMessage = UIMessage<never, UIDataTypes, CoachUITools>

export interface PatternsCoachRequest {
  mode: "patterns"
  messages: CoachUIMessage[]
  sliceLimit: number
  missedLimit: number
  threadId?: string
  debriefChallengeSlug?: string
}

export interface DebriefCoachRequest {
  mode: "debrief"
  messages: CoachUIMessage[]
  context: DebriefContext
}

export type CoachRequest = PatternsCoachRequest | DebriefCoachRequest

function parseWithSchema<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  fallback: string
): ParseResult<T> {
  const parsed = schema.safeParse(raw)
  if (parsed.success) return { ok: true, value: parsed.data }
  const first = parsed.error.issues[0]
  if (!first) return { ok: false, message: fallback }
  const path = first.path.map(String).join(".")
  return {
    ok: false,
    message: path ? `${path}: ${first.message}` : first.message,
  }
}

function normalizeChoice<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return matchChoice(raw, allowed) ?? fallback
}

export function parseCoachRequest(body: unknown): ParseResult<CoachRequest> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object." }
  }
  const record = body as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_KEYS.has(key) && record[key] !== undefined) {
      return { ok: false, message: `Field "${key}" is not allowed.` }
    }
  }
  const parsed = parseWithSchema(
    CoachRequestSchema,
    body,
    "Invalid coach request."
  )
  if (!parsed.ok) return parsed

  const messages: CoachUIMessage[] = parsed.value.messages.map((msg) => ({
    id:
      msg.id && COACH_MESSAGE_ID_REGEX.test(msg.id)
        ? msg.id
        : crypto.randomUUID(),
    role: msg.role,
    parts: msg.parts as CoachUIMessage["parts"],
  }))
  return { ok: true, value: { ...parsed.value, messages } }
}

export function parseCoachPatternsSnapshot(
  raw: unknown
): ParseResult<CoachPatternsSnapshot> {
  return parseWithSchema(
    CoachPatternsSnapshotSchema,
    raw,
    "Invalid coach patterns snapshot."
  )
}

export function clampTargetedDrillSuggestion(
  raw: unknown
): ParseResult<TargetedDrillSuggestion> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "Drill suggestion must be an object." }
  }
  const record = raw as Record<string, unknown>
  if (typeof record.topic !== "string") {
    return { ok: false, message: "Topic must be between 3 and 200 characters." }
  }
  const topic = stripControlChars(record.topic).slice(0, 200).trim()
  if (topic.length < 3 || hasControlChars(topic)) {
    return { ok: false, message: "Topic must be between 3 and 200 characters." }
  }
  const rationale =
    typeof record.rationale === "string"
      ? stripControlChars(record.rationale).slice(0, 400).trim()
      : ""

  return {
    ok: true,
    value: {
      topic,
      language: normalizeChoice(record.language, LANGUAGES, "python"),
      difficulty: normalizeChoice(record.difficulty, DIFFICULTIES, "Medium"),
      ...(rationale ? { rationale } : {}),
    },
  }
}
