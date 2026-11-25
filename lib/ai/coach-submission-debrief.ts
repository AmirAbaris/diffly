import { tool } from "ai"
import { z } from "zod"

import { stripControlChars } from "@/lib/ai/coach-challenge-config"
import {
  buildDebriefSections,
  formatDebriefCodeBody,
  formatDelimitedDebriefBlocks,
  formatIssueList,
  type DebriefContext,
  type DebriefIssueSummary,
  type DelimitedDebriefSections,
} from "@/lib/ai/coach-prompts"
import { hasControlChars } from "@/lib/ai/url-validation"

export class CoachToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CoachToolError"
  }
}

export const COACH_GET_SUBMISSION_DEBRIEF_TOOL_NAME =
  "get_submission_debrief" as const
export const MAX_DEBRIEF_TOOL_OUTPUT_CHARS = 12_000
export const SAFE_CHALLENGE_SLUG_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/

const TRUNCATION_SUFFIX = "\n... [truncated]"
const OMITTED = "[omitted due to size limit]"
const strTrim = (max: number) => z.string().trim().min(1).max(max)
const strMin = (max: number) => z.string().min(1).max(max)

export const SubmissionDebriefInputSchema = z.object({
  challengeSlug: strTrim(200)
    .refine(
      (v) =>
        SAFE_CHALLENGE_SLUG_REGEX.test(v) &&
        !v.includes("..") &&
        !hasControlChars(v),
      "Invalid challenge slug."
    )
    .describe("Exact challenge_slug from Recent Missed Reviews to inspect."),
})

const LineSchema = z.union([
  z.number().int().min(1),
  z.object({ file_path: strTrim(500), line_number: z.number().int().min(1) }),
])

const IssueSchema = z.object({
  id: strMin(200),
  title: strMin(300),
  severity: strMin(50),
  lines: z.array(LineSchema),
  keywords: z.array(z.string().max(200)),
  explanation: z.string(),
})

export const BackendSubmissionDebriefSchema = z.object({
  challenge_slug: strTrim(200),
  title: strTrim(500),
  category: strMin(100),
  language: strMin(60),
  difficulty: strMin(60),
  submission_id: z.number().int().min(1),
  submitted_at: strTrim(100).refine(
    (v) => !Number.isNaN(Date.parse(v)),
    "Invalid timestamp."
  ),
  score: z.number().int().min(0).max(100),
  flagged_lines: z.array(LineSchema),
  false_positive_lines: z.array(LineSchema),
  comments: z.string(),
  detected_issues: z.array(IssueSchema),
  missed_issues: z.array(IssueSchema),
  code_snippet: z.string(),
  files: z.array(
    z.object({
      path: strTrim(500),
      language: strTrim(60),
      content: z.string().nullable().optional(),
      patch: z.string().nullable().optional(),
    })
  ),
  canonical_review: z.string(),
  recommended_fix_diff: z.string(),
  expected_issues: z.array(IssueSchema),
  truncated: z.boolean(),
})

export const SubmissionDebriefToolOutputSchema = z.object({
  challengeSlug: strMin(200),
  challengeTitle: strMin(120),
  score: z.number().int().min(0).max(100),
  truncated: z.boolean(),
  debrief: z.string().min(1),
})

export type SubmissionDebriefInput = z.infer<
  typeof SubmissionDebriefInputSchema
>
export type BackendSubmissionDebrief = z.infer<
  typeof BackendSubmissionDebriefSchema
>
export type SubmissionDebriefToolOutput = z.infer<
  typeof SubmissionDebriefToolOutputSchema
>
export type SubmissionDebriefFetcher = (
  challengeSlug: string,
  options?: { abortSignal?: AbortSignal }
) => Promise<unknown>

type ShrinkKey =
  | "recommendedFixDiff"
  | "codeBody"
  | "canonicalReview"
  | "userComments"
  | "expectedIssuesText"

interface ShrinkState extends Record<ShrinkKey, string> {
  detectedIssues: DebriefIssueSummary[]
  missedIssues: DebriefIssueSummary[]
  clipped: boolean
}

function safeSlice(text: string, length: number): string {
  if (length <= 0) return ""
  if (length >= text.length) return text
  const code = text.charCodeAt(length - 1)
  return code >= 0xd800 && code <= 0xdbff
    ? text.slice(0, length - 1)
    : text.slice(0, length)
}

function jsonLength(output: SubmissionDebriefToolOutput): number {
  return JSON.stringify(output).length
}

function findMaxPrefixFit(
  source: string,
  renderWith: (candidate: string) => SubmissionDebriefToolOutput
): string | null {
  let low = 1
  let high = source.length
  let best: string | null = null
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const candidate = `${safeSlice(source, mid)}${TRUNCATION_SUFFIX}`
    if (jsonLength(renderWith(candidate)) <= MAX_DEBRIEF_TOOL_OUTPUT_CHARS) {
      best = candidate
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return best
}

function shrinkField(
  source: string,
  omittedValue: string,
  apply: (value: string) => void,
  render: () => SubmissionDebriefToolOutput,
  restoreOnFail = true
): boolean {
  if (
    !source ||
    source === omittedValue ||
    source.length <= omittedValue.length
  ) {
    return false
  }
  apply(omittedValue)
  if (jsonLength(render()) > MAX_DEBRIEF_TOOL_OUTPUT_CHARS) {
    if (restoreOnFail) apply(source)
    return false
  }
  apply(
    findMaxPrefixFit(source, (c) => {
      apply(c)
      return render()
    }) ?? omittedValue
  )
  return true
}

function enforceCeiling(
  sections: DelimitedDebriefSections,
  build: (s: DelimitedDebriefSections) => SubmissionDebriefToolOutput
): SubmissionDebriefToolOutput {
  const current = { ...sections }
  const tryShrink = (key: keyof DelimitedDebriefSections): boolean => {
    const original = current[key]
    if (original.length <= OMITTED.length) return false
    current[key] = OMITTED
    if (jsonLength(build(current)) > MAX_DEBRIEF_TOOL_OUTPUT_CHARS) {
      current[key] = original
      return false
    }
    current[key] =
      findMaxPrefixFit(original, (c) => build({ ...current, [key]: c })) ??
      OMITTED
    return true
  }

  if (tryShrink("userCritique")) return build(current)

  for (const key of [
    "canonicalReview",
    "codeUnderReview",
    "userCritique",
  ] as const) {
    if (tryShrink(key)) return build(current)
    current[key] = OMITTED
  }
  return build(current)
}

export function formatSubmissionDebriefOutput(
  raw: BackendSubmissionDebrief
): SubmissionDebriefToolOutput {
  const challengeSlug =
    stripControlChars(raw.challenge_slug).slice(0, 200).trim() || "challenge"
  const challengeTitle =
    stripControlChars(raw.title).slice(0, 120).trim() ||
    challengeSlug.slice(0, 120).trim() ||
    "Challenge"
  const context: DebriefContext = {
    challengeSlug,
    challengeTitle: stripControlChars(raw.title),
    language: stripControlChars(raw.language),
    category: stripControlChars(raw.category),
    difficulty: stripControlChars(raw.difficulty),
    submittedAt: raw.submitted_at,
    codeSnippet: raw.code_snippet,
    files: raw.files,
    userFlaggedLines: raw.flagged_lines,
    falsePositiveLines: raw.false_positive_lines,
    userComments: raw.comments,
    score: raw.score,
    detectedIssues: raw.detected_issues,
    missedIssues: raw.missed_issues,
    canonicalReview: raw.canonical_review,
    recommendedFixDiff: raw.recommended_fix_diff,
    expectedIssues: raw.expected_issues,
  }
  const state: ShrinkState = {
    recommendedFixDiff: context.recommendedFixDiff ?? "",
    codeBody: formatDebriefCodeBody(context),
    canonicalReview: context.canonicalReview
      ? `Canonical Review:\n${context.canonicalReview}`
      : "Canonical Review: (none provided)",
    userComments: context.userComments || "(none)",
    expectedIssuesText: formatIssueList(
      "Expected Issues",
      context.expectedIssues
    ),
    detectedIssues: context.detectedIssues ?? [],
    missedIssues: context.missedIssues ?? [],
    clipped: false,
  }
  const buildOutput = (
    sections: DelimitedDebriefSections
  ): SubmissionDebriefToolOutput => ({
    challengeSlug,
    challengeTitle,
    score: raw.score,
    truncated: raw.truncated || state.clipped,
    debrief: formatDelimitedDebriefBlocks(sections),
  })
  const buildSections = () =>
    buildDebriefSections({ ...context, ...state }, state)
  const render = () => buildOutput(buildSections())
  const initial = render()
  if (jsonLength(initial) <= MAX_DEBRIEF_TOOL_OUTPUT_CHARS) return initial

  state.clipped = true
  const steps: Array<[ShrinkKey, string, string]> = [
    ["recommendedFixDiff", state.recommendedFixDiff, ""],
    ["codeBody", state.codeBody, OMITTED],
    ["canonicalReview", state.canonicalReview, `Canonical Review: ${OMITTED}`],
    ["userComments", state.userComments, OMITTED],
    [
      "expectedIssuesText",
      state.expectedIssuesText,
      `Expected Issues: ${OMITTED}`,
    ],
  ]
  const trySteps = (restoreOnFail: boolean): boolean =>
    steps.some(([key, source, omitted]) =>
      shrinkField(
        source,
        omitted,
        (v) => {
          state[key] = v
        },
        render,
        restoreOnFail
      )
    )

  if (trySteps(true)) return render()

  const compact = (list: DebriefIssueSummary[]) =>
    list.map(({ id, title, severity, lines }) => ({
      id,
      title,
      severity,
      lines,
    }))
  state.detectedIssues = compact(state.detectedIssues)
  state.missedIssues = compact(state.missedIssues)
  const compacted = render()
  if (jsonLength(compacted) <= MAX_DEBRIEF_TOOL_OUTPUT_CHARS) return compacted

  if (trySteps(true) || trySteps(false)) return render()

  for (const [key, source] of steps) state[key] = source
  return enforceCeiling(buildSections(), buildOutput)
}

export function createSubmissionDebriefTool(
  fetcher?: SubmissionDebriefFetcher
) {
  return tool({
    description:
      "Fetch line-specific submission details (code under review, flagged lines, comments, detected/missed issues, and canonical review) for one specific challenge_slug from Recent Missed Reviews.",
    inputSchema: SubmissionDebriefInputSchema,
    outputSchema: SubmissionDebriefToolOutputSchema,
    toModelOutput: ({ output }) => ({ type: "text", value: output.debrief }),
    execute: async (
      { challengeSlug },
      options
    ): Promise<SubmissionDebriefToolOutput> => {
      if (!fetcher) {
        throw new CoachToolError(
          "Submission debrief lookup is unavailable in this mode."
        )
      }
      const parsedSlug = SubmissionDebriefInputSchema.safeParse({
        challengeSlug,
      })
      if (!parsedSlug.success) {
        throw new CoachToolError(
          parsedSlug.error.issues[0]?.message ?? "Invalid challenge slug."
        )
      }
      const slug = parsedSlug.data.challengeSlug
      const raw = await (options?.abortSignal
        ? fetcher(slug, { abortSignal: options.abortSignal })
        : fetcher(slug))
      const parsedRaw = BackendSubmissionDebriefSchema.safeParse(raw)
      if (!parsedRaw.success) {
        throw new CoachToolError(
          "Invalid submission debrief response from backend."
        )
      }
      return formatSubmissionDebriefOutput(parsedRaw.data)
    },
  })
}
