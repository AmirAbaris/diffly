import { tool, type InferUITools, type UIDataTypes, type UIMessage } from "ai"
import { z } from "zod"

import type {
  CoachPatternsSnapshot,
  DebriefContext,
} from "@/lib/ai/coach-prompts"
import { hasControlChars } from "@/lib/ai/url-validation"
import {
  CHALLENGE_DIFFICULTIES,
  CHALLENGE_LANGUAGES,
  type Difficulty,
  type Language,
} from "@/types/challenge"

export * from "@/lib/ai/coach-prompts"

export type CoachMode = "patterns" | "debrief"
export const COACH_MAX_STEPS = 3
export const COACH_STREAM_TIMEOUT_MS = 50_000
export const COACH_SUGGEST_DRILL_TOOL_NAME = "suggest_targeted_drill" as const

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
const TOOL_STATES = [
  "input-streaming",
  "input-available",
  "approval-requested",
  "approval-responded",
  "output-available",
  "output-error",
  "output-denied",
] as const

export type ParseResult<T> =
  { ok: true; value: T } | { ok: false; message: string }

export interface TargetedDrillSuggestion {
  topic: string
  language: Language
  difficulty: Difficulty
  rationale?: string
}

export function createCoachTools() {
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
        if (!clamped.ok) throw new Error(clamped.message)
        return clamped.value
      },
    }),
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
}

export interface DebriefCoachRequest {
  mode: "debrief"
  messages: CoachUIMessage[]
  context: DebriefContext
}

export type CoachRequest = PatternsCoachRequest | DebriefCoachRequest

const str1 = z.string().trim().min(1)
const nonEmpty = (max: number) => str1.max(max)
const nonNegInt = z.number().int().min(0)
const posInt = z.number().int().min(1)
const pct = z.number().min(0).max(100)
const optText = (max: number) => z.string().max(max).nullable().optional()
const textLikePart = (type: "text" | "reasoning") =>
  z.looseObject({ type: z.literal(type), text: z.string().max(8_000) })

const CoachPartSchema = z.union([
  textLikePart("text"),
  textLikePart("reasoning"),
  z.looseObject({ type: z.literal("step-start") }),
  z
    .looseObject({
      type: z.literal(`tool-${COACH_SUGGEST_DRILL_TOOL_NAME}`),
      toolCallId: nonEmpty(200),
      state: z.enum(TOOL_STATES),
      errorText: z.string().max(8_000).optional(),
    })
    .refine(
      (p) => JSON.stringify(p).length <= 16_000,
      "Tool payload too large."
    ),
])

const CoachMessagesSchema = z
  .array(
    z
      .object({
        id: nonEmpty(200).optional(),
        role: z.enum(["user", "assistant"], {
          error: "Only user and assistant messages are allowed.",
        }),
        parts: z.array(CoachPartSchema).min(1).max(50),
      })
      .refine(
        (m) =>
          m.role === "assistant" || m.parts.every((p) => p.type === "text"),
        "User messages may only contain text parts."
      )
  )
  .min(1)
  .max(40)

const FlaggedLineSchema = z.union([
  posInt,
  z.object({ file_path: nonEmpty(300), line_number: posInt }),
])
const DebriefIssueListSchema = z
  .array(
    z.object({
      id: nonEmpty(200),
      title: nonEmpty(300),
      severity: nonEmpty(40),
      lines: z.array(FlaggedLineSchema).max(100).optional(),
      keywords: z.array(z.string().max(120)).max(50).optional(),
      explanation: z.string().max(4_000).optional(),
    })
  )
  .max(50)
  .optional()

const DebriefFileSchema = z.object({
  path: nonEmpty(300),
  language: nonEmpty(60),
  content: optText(30_000),
  patch: optText(30_000),
})

const DebriefContextSchema = z.object({
  challengeSlug: nonEmpty(200).refine(
    (v) => !hasControlChars(v),
    "Invalid challenge slug."
  ),
  challengeTitle: z.string().trim().max(300).optional(),
  language: z.string().trim().max(60).optional(),
  codeSnippet: z.string().max(30_000).optional(),
  files: z.array(DebriefFileSchema).max(20).optional(),
  userFlaggedLines: z.array(FlaggedLineSchema).max(500).optional().default([]),
  userComments: z.string().max(10_000).optional().default(""),
  score: pct.optional(),
  detectedIssues: DebriefIssueListSchema,
  missedIssues: DebriefIssueListSchema,
  canonicalReview: z.string().max(15_000).optional(),
  recommendedFixDiff: z.string().max(25_000).optional(),
  expectedIssues: DebriefIssueListSchema,
})

const CoachRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("patterns"),
    messages: CoachMessagesSchema,
    sliceLimit: z.number().int().min(1).max(20).optional().default(5),
    missedLimit: z.number().int().min(1).max(50).optional().default(10),
  }),
  z.object({
    mode: z.literal("debrief"),
    messages: CoachMessagesSchema,
    context: DebriefContextSchema,
  }),
])

const sliceMeta = { category: str1, language: str1, difficulty: str1 }
const failureModes = [
  "low_recall",
  "low_precision",
  "low_concept_coverage",
] as const

const PatternSliceSchema = z.object({
  ...sliceMeta,
  attempts: posInt,
  unique_challenges: posInt,
  average_score: pct,
  precision: pct,
  recall: pct,
  concept_coverage: pct,
  dominant_failure_mode: z.enum(failureModes).nullable().default(null),
})

const CoachPatternsSnapshotSchema = z.object({
  total_submissions: nonNegInt,
  total_missed_submissions: nonNegInt,
  weakest_slices: z.array(PatternSliceSchema),
  strongest_slices: z.array(PatternSliceSchema),
  recent_missed: z.array(
    z.object({
      challenge_slug: str1,
      title: str1,
      ...sliceMeta,
      score: z.number().int().min(0).max(100),
      missed_line_count: nonNegInt,
      false_positive_count: nonNegInt,
      submitted_at: str1.refine(
        (v) => !Number.isNaN(Date.parse(v)),
        "Invalid timestamp."
      ),
    })
  ),
})

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

function stripControlChars(value: string): string {
  // Normalize line breaks to spaces before stripping control chars so words stay separated.
  const withoutBreaks = value.replace(/[\r\n]+/g, " ")
  let out = ""
  for (let i = 0; i < withoutBreaks.length; i += 1) {
    const code = withoutBreaks.charCodeAt(i)
    if (code >= 0x20 && code !== 0x7f) out += withoutBreaks[i]
  }
  return out.trim()
}

function normalizeChoice<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  if (typeof raw !== "string") return fallback
  const norm = raw.trim().toLowerCase()
  return allowed.find((item) => item.toLowerCase() === norm) ?? fallback
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

  const messages: CoachUIMessage[] = parsed.value.messages.map((msg, i) => ({
    id: msg.id ?? `msg-${i}`,
    role: msg.role,
    parts: msg.parts as CoachUIMessage["parts"],
  }))
  return {
    ok: true,
    value:
      parsed.value.mode === "patterns"
        ? { ...parsed.value, messages }
        : { ...parsed.value, messages },
  }
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
