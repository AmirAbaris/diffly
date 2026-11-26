import { z } from "zod"

import { COACH_CONFIGURE_CHALLENGE_TOOL_NAME } from "@/lib/ai/coach-challenge-config"
import { COACH_GET_SUBMISSION_DEBRIEF_TOOL_NAME } from "@/lib/ai/coach-submission-debrief"
import { hasControlChars } from "@/lib/ai/url-validation"

export const COACH_MAX_REQUEST_MESSAGES = 40
export const COACH_MAX_TEXT_PART_CHARS = 16_000
export const COACH_MESSAGE_ID_REGEX = /^[A-Za-z0-9._:-]{1,128}$/
export const COACH_SUGGEST_DRILL_TOOL_NAME = "suggest_targeted_drill" as const
export const COACH_TOOL_NAMES = [
  COACH_SUGGEST_DRILL_TOOL_NAME,
  COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
  COACH_GET_SUBMISSION_DEBRIEF_TOOL_NAME,
] as const

const TOOL_STATES = [
  "input-streaming",
  "input-available",
  "approval-requested",
  "approval-responded",
  "output-available",
  "output-error",
  "output-denied",
] as const

const str1 = z.string().trim().min(1)
const nonEmpty = (max: number) => str1.max(max)
const nonNegInt = z.number().int().min(0)
const posInt = z.number().int().min(1)
const pct = z.number().min(0).max(100)
const optText = (max: number) => z.string().max(max).nullable().optional()
const textLikePart = (type: "text" | "reasoning") =>
  z.looseObject({
    type: z.literal(type),
    text: z.string().max(COACH_MAX_TEXT_PART_CHARS),
  })

const CoachToolPartSchemas = COACH_TOOL_NAMES.map((name) =>
  z
    .looseObject({
      type: z.literal(`tool-${name}`),
      toolCallId: nonEmpty(200),
      state: z.enum(TOOL_STATES),
      errorText: z.string().max(8_000).optional(),
    })
    .refine(
      (p) => JSON.stringify(p).length <= 16_000,
      "Tool payload too large."
    )
)

const CoachPartSchema = z.union([
  textLikePart("text"),
  textLikePart("reasoning"),
  z.looseObject({ type: z.literal("step-start") }),
  ...CoachToolPartSchemas,
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
  .max(COACH_MAX_REQUEST_MESSAGES)

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

const SafeChallengeSlugSchema = nonEmpty(200).refine(
  (v) => !hasControlChars(v) && !/[\s/\\]/.test(v),
  "Invalid challenge slug."
)

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

export const CoachRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("patterns"),
    messages: CoachMessagesSchema,
    sliceLimit: z.number().int().min(1).max(20).optional().default(5),
    missedLimit: z.number().int().min(1).max(50).optional().default(10),
    threadId: z.string().uuid().optional(),
    debriefChallengeSlug: SafeChallengeSlugSchema.optional(),
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

export const CoachPatternsSnapshotSchema = z.object({
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
