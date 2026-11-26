import { generateText, NoObjectGeneratedError, Output } from "ai"
import { z } from "zod"

import {
  createBYOKModel,
  mapProviderError,
  type SealedAICredential,
} from "@/lib/ai/provider"
import { hasControlChars } from "@/lib/ai/url-validation"
import type {
  Difficulty,
  GenerateCustomChallengePayload,
  Language,
} from "@/types/challenge"

export const CHALLENGE_GENERATION_TIMEOUT_MS = 45_000
export const MAX_GENERATION_ATTEMPTS = 2

const MIN_TOPIC_LENGTH = 3
const MAX_TOPIC_LENGTH = 200
const INVALID_CHALLENGE_STRUCTURE_MESSAGE =
  "AI provider returned an invalid challenge structure. Please try again."

const SUPPORTED_LANGUAGES = [
  "python",
  "typescript",
  "go",
  "rust",
  "java",
] as const
const SUPPORTED_DIFFICULTIES = ["Easy", "Medium", "Hard"] as const

const DIFFICULTY_GUIDANCE: Readonly<Record<Difficulty, string>> = {
  Easy: "1 clear, realistic defect in a focused service method (35 to 45 lines) with clean surrounding code; no contrived toy triggers.",
  Medium:
    "1 to 2 realistic defects across interacting helper methods or request/tool boundaries (40 to 55 lines) requiring data-flow tracing.",
  Hard: "2 subtle defects involving state, concurrency, trust boundaries, or edge-case failure paths (45 to 65 lines) where surrounding code looks plausible.",
}

const SPOILER_COMMENT_PATTERN =
  /(?:\/\/|#)\s*(?:VULNERABLE|BUG|DEFECT|INSECURE|EXPLOIT|SPOILER)\b/i
const HINT_LINE_NUMBER_PATTERN = /\blines?\s+\d+/i

export const GeneratedChallengeSchema = z.object({
  slug: z.string(),
  title: z.string(),
  difficulty: z.enum(SUPPORTED_DIFFICULTIES),
  category: z.enum([
    "Security",
    "Concurrency",
    "Performance",
    "Logic Flaws",
    "Agent Antipaths",
  ]),
  language: z.enum(SUPPORTED_LANGUAGES),
  description: z.string(),
  threat_model: z.string(),
  defect_target: z.string(),
  code_snippet: z.string(),
  expected_issues: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      severity: z.enum(["low", "medium", "high", "critical"]),
      anchor_lines: z.array(z.string()),
      matched_lines: z.array(z.number().int()),
      matched_keywords: z.array(z.string()),
      explanation: z.string(),
    })
  ),
  hints: z.array(
    z.object({
      tier: z.number().int(),
      label: z.string(),
      text: z.string(),
    })
  ),
  canonical_review: z.string(),
  recommended_fix_diff: z.string(),
})

export type GeneratedChallenge = z.infer<typeof GeneratedChallengeSchema>

export type ParseGeneratePayloadResult =
  | { ok: true; value: GenerateCustomChallengePayload }
  | { ok: false; message: string }

export type ChallengeQualityValidationResult =
  { ok: true } | { ok: false; reasons: readonly string[] }

export type GenerateChallengeResult =
  | { ok: true; data: GeneratedChallenge }
  | {
      ok: false
      status: number
      message: string
      retryable?: boolean
      validationIssues?: readonly string[]
    }

export type GenerateChallengeAIResult = GenerateChallengeResult

const isOneOf = <T extends string>(
  allowed: readonly T[],
  value: unknown
): value is T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value)

export function parseGenerateChallengePayload(
  body: unknown
): ParseGeneratePayloadResult {
  const err = (message: string): ParseGeneratePayloadResult => ({
    ok: false,
    message,
  })
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return err("Request body must be a JSON object.")
  }

  const record = body as Record<string, unknown>
  if (typeof record.topic !== "string") {
    return err("Topic must be between 3 and 200 characters.")
  }
  if (hasControlChars(record.topic)) {
    return err("Topic contains invalid control characters.")
  }

  const topic = record.topic.trim()
  if (topic.length < MIN_TOPIC_LENGTH || topic.length > MAX_TOPIC_LENGTH) {
    return err("Topic must be between 3 and 200 characters.")
  }

  const language: Language =
    record.language === undefined
      ? "python"
      : isOneOf(SUPPORTED_LANGUAGES, record.language)
        ? record.language
        : ("" as Language)
  if (!language) {
    return err("Language must be python, typescript, go, rust, or java.")
  }

  const difficulty: Difficulty =
    record.difficulty === undefined
      ? "Medium"
      : isOneOf(SUPPORTED_DIFFICULTIES, record.difficulty)
        ? record.difficulty
        : ("" as Difficulty)
  if (!difficulty) return err("Difficulty must be Easy, Medium, or Hard.")

  return { ok: true, value: { topic, language, difficulty } }
}

export function buildChallengeGenerationPrompt(
  payload: GenerateCustomChallengePayload,
  options?: { previousIssues?: readonly string[] }
): string {
  const sections = [
    "You are a staff software architect creating a realistic, self-contained code review challenge for Diffly.",
    "Return a single valid JSON object matching the schema with required JSON keys: slug, title, difficulty, category, language, description, threat_model, defect_target, code_snippet, expected_issues, hints, canonical_review, recommended_fix_diff.",
    "",
    "Scenario Requirements:",
    `- Topic: ${payload.topic}`,
    `- Language: ${payload.language} (set output language to "${payload.language}")`,
    `- Difficulty: ${payload.difficulty} (set output difficulty to "${payload.difficulty}") — ${DIFFICULTY_GUIDANCE[payload.difficulty]}`,
    '- Category: choose the best fit from "Security", "Concurrency", "Performance", "Logic Flaws", or "Agent Antipaths".',
    "",
    "Anti-Spoiler Metadata:",
    "- title and description: describe the service/PR purpose without naming the vulnerability or offending line.",
    "- defect_target: state defect count, severity, and broad area without naming the exact variable, call, or line.",
    "- threat_model: describe attacker capability and real-world impact without revealing exact lines.",
    "",
    "Code Realism & Cleanliness:",
    `- code_snippet: 35 to 65 lines of realistic, idiomatic, runnable production ${payload.language} code.`,
    '- Forbid toy triggers (such as substring checks like `if "diagnostic" in user_input` or trivial `dict(os.environ)` dumps).',
    "- Keep all non-target lines clean and bug-free (valid API schemas, HTTP timeouts, status/error checks, no unrelated leaks or formatting typos).",
    "- Never add comments that hint at or name the defect.",
    "",
    "Grading Precision:",
    "- expected_issues: keep each defect localized to its root-cause line(s); never leave duplicate ungraded leaks of the same flaw elsewhere in code_snippet.",
    "- Include every root-cause line in anchor_lines (verbatim lines from code_snippet) and matched_lines (1-indexed) so strong reviewers are not penalized as false positives.",
    '- Provide 4 to 6 matched_keywords per issue, severity ("low", "medium", "high", or "critical"), and a clear root-cause explanation.',
    "",
    "Progressive Hints:",
    "- hints: provide tiers 1, 2, and 3 (tier, label, text): Tier 1 (Contextual Clue, no vulnerability name or line numbers), Tier 2 (Vulnerability Class, no line numbers), Tier 3 (Line Pointer referencing exact matched_lines and remediation direction).",
    "- Also provide canonical_review (exemplary staff-level critique), recommended_fix_diff (minimal unified diff), and slug (lowercase kebab-case).",
  ]

  const corrections = (options?.previousIssues ?? [])
    .map((issue) => issue.trim())
    .filter(Boolean)

  if (corrections.length > 0) {
    sections.push(
      "",
      "Previous Attempt Corrections:",
      ...corrections.map((issue) => `- ${issue}`)
    )
  }

  return sections.join("\n")
}

export function validateGeneratedChallengeQuality(
  output: GeneratedChallenge
): ChallengeQualityValidationResult {
  const reasons: string[] = []
  for (const field of [
    "title",
    "description",
    "defect_target",
    "code_snippet",
    "canonical_review",
  ] as const) {
    if (!output[field].trim()) reasons.push(`${field} must be non-empty.`)
  }

  const codeLines = output.code_snippet.split(/\r?\n/)
  const trimmedCodeLines = new Set(codeLines.map((line) => line.trim()))

  if (SPOILER_COMMENT_PATTERN.test(output.code_snippet)) {
    reasons.push("code_snippet must not contain spoiler comments.")
  }
  if (output.expected_issues.length === 0) {
    reasons.push("expected_issues must contain at least one issue.")
  }

  output.expected_issues.forEach((issue, index) => {
    const label = `expected_issues[${index}]`
    if (!issue.title.trim()) reasons.push(`${label}.title must be non-empty.`)
    if (!issue.explanation.trim()) {
      reasons.push(`${label}.explanation must be non-empty.`)
    }

    const anchors = issue.anchor_lines.map((l) => l.trim()).filter(Boolean)
    if (anchors.length === 0 && !issue.matched_lines.some((l) => l >= 1)) {
      reasons.push(`${label} needs non-empty anchor_lines or matched_lines.`)
    }

    for (const line of issue.matched_lines) {
      if (line < 1 || line > codeLines.length) {
        reasons.push(
          `${label}.matched_lines has out-of-bounds line ${line} (max ${codeLines.length}).`
        )
      }
    }

    for (const anchor of anchors) {
      if (!trimmedCodeLines.has(anchor)) {
        reasons.push(
          `${label}.anchor_lines "${anchor}" does not appear verbatim in code_snippet.`
        )
      }
    }
  })

  const hintsByTier = new Set<number>()
  for (const hint of output.hints) {
    if (hint.text.trim()) hintsByTier.add(hint.tier)
    if (
      hint.tier <= 2 &&
      hint.tier >= 1 &&
      HINT_LINE_NUMBER_PATTERN.test(hint.text)
    ) {
      reasons.push(
        `Tier ${hint.tier} hint must not leak explicit line numbers.`
      )
    }
  }
  for (const tier of [1, 2, 3] as const) {
    if (!hintsByTier.has(tier))
      reasons.push(`hints must include tier ${tier} with non-empty text.`)
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons }
}

const isSignalTimedOut = (signal?: AbortSignal): boolean =>
  Boolean(
    signal?.aborted &&
    typeof signal.reason === "object" &&
    signal.reason !== null &&
    (signal.reason as { name?: unknown }).name === "TimeoutError"
  )

const invalidStructureResult = (
  validationIssues?: readonly string[]
): GenerateChallengeResult => ({
  ok: false,
  status: 502,
  retryable: true,
  message: INVALID_CHALLENGE_STRUCTURE_MESSAGE,
  ...(validationIssues ? { validationIssues } : {}),
})

export async function generateCustomChallengeWithAI(
  credential: SealedAICredential,
  payload: GenerateCustomChallengePayload,
  options?: {
    signal?: AbortSignal
    clientSignal?: AbortSignal
    previousIssues?: readonly string[]
  }
): Promise<GenerateChallengeResult> {
  const fallbackSignal = options?.signal
    ? undefined
    : AbortSignal.timeout(CHALLENGE_GENERATION_TIMEOUT_MS)
  const abortSignal = options?.signal ?? (fallbackSignal as AbortSignal)

  try {
    const result = await generateText({
      model: createBYOKModel(credential),
      output: Output.object({ schema: GeneratedChallengeSchema }),
      prompt: buildChallengeGenerationPrompt(payload, {
        previousIssues: options?.previousIssues,
      }),
      temperature: options?.previousIssues?.length ? 0.55 : 0.4,
      maxRetries: 0,
      abortSignal,
    })

    if (!result.output) return invalidStructureResult()
    const validation = validateGeneratedChallengeQuality(result.output)
    return validation.ok
      ? { ok: true, data: result.output }
      : invalidStructureResult(validation.reasons)
  } catch (error) {
    if (
      NoObjectGeneratedError.isInstance(error) ||
      error instanceof NoObjectGeneratedError
    ) {
      return invalidStructureResult()
    }

    const timedOut =
      Boolean(fallbackSignal?.aborted) || isSignalTimedOut(options?.signal)
    const clientAborted =
      !timedOut && Boolean((options?.clientSignal ?? options?.signal)?.aborted)
    const mapped = mapProviderError(error, {
      timedOut,
      clientAborted,
      abortMessage: "Challenge generation was cancelled.",
    })
    return {
      ok: false,
      status: mapped.status,
      retryable: false,
      message: mapped.message,
    }
  }
}
