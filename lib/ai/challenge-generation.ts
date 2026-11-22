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
] as const satisfies readonly Language[]

const SUPPORTED_DIFFICULTIES = [
  "Easy",
  "Medium",
  "Hard",
] as const satisfies readonly Difficulty[]

const ExpectedIssueSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  anchor_lines: z.array(z.string()),
  matched_lines: z.array(z.number().int()),
  matched_keywords: z.array(z.string()),
  explanation: z.string(),
})

const HintSchema = z.object({
  tier: z.number().int(),
  label: z.string(),
  text: z.string(),
})

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
  expected_issues: z.array(ExpectedIssueSchema),
  hints: z.array(HintSchema),
  canonical_review: z.string(),
  recommended_fix_diff: z.string(),
})

export type GeneratedChallenge = z.infer<typeof GeneratedChallengeSchema>

export type ParseGeneratePayloadResult =
  | { ok: true; value: GenerateCustomChallengePayload }
  | { ok: false; message: string }

export type GenerateChallengeResult =
  | { ok: true; data: GeneratedChallenge }
  | { ok: false; status: number; message: string; retryable?: boolean }

export type GenerateChallengeAIResult = GenerateChallengeResult

function isSupportedLanguage(value: unknown): value is Language {
  return (
    typeof value === "string" &&
    (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
  )
}

function isSupportedDifficulty(value: unknown): value is Difficulty {
  return (
    typeof value === "string" &&
    (SUPPORTED_DIFFICULTIES as readonly string[]).includes(value)
  )
}

export function parseGenerateChallengePayload(
  body: unknown
): ParseGeneratePayloadResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object." }
  }

  const record = body as Record<string, unknown>

  if (typeof record.topic !== "string") {
    return {
      ok: false,
      message: "Topic must be between 3 and 200 characters.",
    }
  }
  if (hasControlChars(record.topic)) {
    return { ok: false, message: "Topic contains invalid control characters." }
  }

  const topic = record.topic.trim()
  if (topic.length < MIN_TOPIC_LENGTH || topic.length > MAX_TOPIC_LENGTH) {
    return {
      ok: false,
      message: "Topic must be between 3 and 200 characters.",
    }
  }

  let language: Language = "python"
  if (record.language !== undefined) {
    if (!isSupportedLanguage(record.language)) {
      return {
        ok: false,
        message: "Language must be python, typescript, go, rust, or java.",
      }
    }
    language = record.language
  }

  let difficulty: Difficulty = "Medium"
  if (record.difficulty !== undefined) {
    if (!isSupportedDifficulty(record.difficulty)) {
      return {
        ok: false,
        message: "Difficulty must be Easy, Medium, or Hard.",
      }
    }
    difficulty = record.difficulty
  }

  return {
    ok: true,
    value: {
      topic,
      language,
      difficulty,
    },
  }
}

export function buildChallengeGenerationPrompt(
  payload: GenerateCustomChallengePayload
): string {
  return [
    "You are an elite software architect creating a realistic, self-contained code review challenge for Diffly.",
    "Return a single valid JSON object matching the schema.",
    "Required JSON keys: slug, title, difficulty, category, language, description, threat_model, defect_target, code_snippet, expected_issues, hints, canonical_review, recommended_fix_diff.",
    "",
    "Scenario Requirements:",
    `- Topic: ${payload.topic}`,
    `- Language: ${payload.language} (set output language to "${payload.language}")`,
    `- Difficulty: ${payload.difficulty} (set output difficulty to "${payload.difficulty}")`,
    '- Category: choose the best fit from "Security", "Concurrency", "Performance", "Logic Flaws", or "Agent Antipaths".',
    "",
    "Constraints:",
    `1. code_snippet: Provide 30 to 60 lines of realistic, idiomatic, production-grade ${payload.language} code containing 1 to 2 subtle, realistic defects. Never include comments that hint at, name, or reveal the defect or missing guard.`,
    "2. expected_issues: Provide 1 or 2 issue JSON objects with keys id, title, severity, anchor_lines, matched_lines, matched_keywords, explanation. Each item must include:",
    "   - anchor_lines: exact verbatim non-empty, non-comment vulnerable code lines copied directly from code_snippet.",
    "   - matched_lines: 1-indexed line numbers in code_snippet corresponding to anchor_lines.",
    "   - matched_keywords: 3 to 5 technical keywords or concepts a strong reviewer should mention.",
    '   - severity: "low", "medium", "high", or "critical".',
    "   - explanation: clear explanation of root cause and risk.",
    "3. hints: Provide exactly 3 progressive hint JSON objects with keys tier (1, 2, and 3), label, and text:",
    "   - Tier 1 (Contextual Clue): general invariant or area to inspect.",
    "   - Tier 2 (Vulnerability Class): conceptual flaw or failure pattern.",
    "   - Tier 3 (Line Pointer): direct pointer to the defective line numbers.",
    "4. threat_model: Concrete exploit or failure impact and real-world consequences.",
    "5. defect_target: Concise task instruction describing what the reviewer needs to catch.",
    "6. canonical_review: Exemplary senior staff engineer code review critique.",
    "7. recommended_fix_diff: Valid unified diff showing the minimal fix for the defect(s).",
    "8. slug: Lowercase kebab-case identifier matching the challenge.",
  ].join("\n")
}

function isValidGeneratedChallengeOutput(output: GeneratedChallenge): boolean {
  if (
    !output.title.trim() ||
    !output.description.trim() ||
    !output.code_snippet.trim() ||
    output.expected_issues.length === 0 ||
    output.hints.length === 0
  ) {
    return false
  }

  return (
    output.expected_issues.every(
      (issue) =>
        Boolean(issue.title.trim()) &&
        Boolean(issue.explanation.trim()) &&
        (issue.anchor_lines.some((line) => Boolean(line.trim())) ||
          issue.matched_lines.some((line) => line >= 1))
    ) && output.hints.every((hint) => Boolean(hint.text.trim()))
  )
}

function isSignalTimedOut(signal?: AbortSignal): boolean {
  if (!signal?.aborted) {
    return false
  }
  const reason = signal.reason as { name?: unknown } | undefined
  return Boolean(
    reason && typeof reason === "object" && reason.name === "TimeoutError"
  )
}

export async function generateCustomChallengeWithAI(
  credential: SealedAICredential,
  payload: GenerateCustomChallengePayload,
  options?: { signal?: AbortSignal; clientSignal?: AbortSignal }
): Promise<GenerateChallengeResult> {
  const fallbackTimeoutSignal = options?.signal
    ? undefined
    : AbortSignal.timeout(CHALLENGE_GENERATION_TIMEOUT_MS)
  const abortSignal = options?.signal ?? (fallbackTimeoutSignal as AbortSignal)

  try {
    const result = await generateText({
      model: createBYOKModel(credential),
      output: Output.object({ schema: GeneratedChallengeSchema }),
      prompt: buildChallengeGenerationPrompt(payload),
      temperature: 0.2,
      maxRetries: 0,
      abortSignal,
    })

    if (!result.output || !isValidGeneratedChallengeOutput(result.output)) {
      return {
        ok: false,
        status: 502,
        retryable: true,
        message: INVALID_CHALLENGE_STRUCTURE_MESSAGE,
      }
    }

    return { ok: true, data: result.output }
  } catch (error) {
    if (
      NoObjectGeneratedError.isInstance(error) ||
      error instanceof NoObjectGeneratedError
    ) {
      return {
        ok: false,
        status: 502,
        retryable: true,
        message: INVALID_CHALLENGE_STRUCTURE_MESSAGE,
      }
    }

    const timedOut =
      Boolean(fallbackTimeoutSignal?.aborted) ||
      isSignalTimedOut(options?.signal)
    const clientAborted = options?.clientSignal
      ? options.clientSignal.aborted && !timedOut
      : Boolean(options?.signal?.aborted && !timedOut)

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
