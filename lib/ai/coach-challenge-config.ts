import { z } from "zod"

import { hasControlChars } from "@/lib/ai/url-validation"
import {
  CHALLENGE_DIFFICULTIES,
  CHALLENGE_LANGUAGES,
  type Difficulty,
  type Language,
} from "@/types/challenge"

export const COACH_CONFIGURE_CHALLENGE_TOOL_NAME =
  "configure_challenge" as const

export type ConfigureChallengeField = "language" | "difficulty" | "topic"

const LANGUAGES = CHALLENGE_LANGUAGES.map((l) => l.value) as [
  Language,
  ...Language[],
]
const DIFFICULTIES = [...CHALLENGE_DIFFICULTIES] as [
  Difficulty,
  ...Difficulty[],
]
const ALL_CONFIG_FIELDS: readonly ConfigureChallengeField[] = [
  "language",
  "difficulty",
  "topic",
]

export interface ConfigureChallengeTopicOption {
  label: string
  topic: string
  rationale?: string
}

export interface ConfigureChallengeInput {
  prompt?: string
  language?: Language
  difficulty?: Difficulty
  topic?: string
  suggestedTopics?: ConfigureChallengeTopicOption[]
}

export interface NormalizedChallengeConfigInput {
  prompt: string
  prefilled: {
    language?: Language
    difficulty?: Difficulty
    topic?: string
  }
  missingFields: readonly ConfigureChallengeField[]
  suggestedTopics: readonly ConfigureChallengeTopicOption[]
}

export const ConfigureChallengeInputSchema = z.object({
  prompt: z
    .string()
    .max(160)
    .optional()
    .describe("Short heading for the challenge configuration card."),
  language: z
    .enum(LANGUAGES)
    .optional()
    .describe("Pre-filled language when the user already specified one."),
  difficulty: z
    .enum(DIFFICULTIES)
    .optional()
    .describe("Pre-filled difficulty when the user already specified one."),
  topic: z
    .string()
    .max(200)
    .optional()
    .describe("Pre-filled topic when the user already specified one."),
  suggestedTopics: z
    .array(
      z.object({
        label: z.string().max(60).describe("Short pill label (<= 60 chars)."),
        topic: z
          .string()
          .max(200)
          .describe("Focused generation topic (3 to 200 chars)."),
        rationale: z
          .string()
          .max(140)
          .optional()
          .describe("Brief 1-line reason tailored to the user."),
      })
    )
    .max(4)
    .optional()
    .describe("3 to 4 curated topic options grounded in user history."),
})

export const ConfigureChallengeOutputSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("created"),
    slug: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(300),
    language: z.enum(LANGUAGES),
    difficulty: z.enum(DIFFICULTIES),
    topic: z.string().trim().min(3).max(200),
  }),
  z.object({
    status: z.literal("cancelled"),
  }),
  z.object({
    status: z.literal("quota_full"),
    quotaLimit: z.number().int().min(1),
  }),
])

export type ConfigureChallengeOutput = z.infer<
  typeof ConfigureChallengeOutputSchema
>

const DEFAULT_TOPICS_BY_LANGUAGE: Record<
  Language,
  readonly ConfigureChallengeTopicOption[]
> = {
  python: [
    {
      label: "FastAPI JWT auth bypass",
      topic: "JWT signature and algorithm confusion in FastAPI auth middleware",
      rationale: "Common high-impact security blind spot in Python APIs.",
    },
    {
      label: "Asyncio lock race",
      topic: "Shared mutable state race condition across asyncio await points",
      rationale: "Builds recall for subtle async concurrency bugs.",
    },
    {
      label: "SQL query injection",
      topic: "String-interpolated SQL filter clauses in repository helpers",
      rationale: "Sharpens detection of unsafe query construction.",
    },
  ],
  typescript: [
    {
      label: "Async cache race",
      topic:
        "Stale read-modify-write race condition in async cache invalidation",
      rationale:
        "Targets subtle concurrency defects in Node/TypeScript services.",
    },
    {
      label: "Prototype pollution",
      topic: "Unsafe deep object merge leading to prototype pollution",
      rationale: "High-severity security flaw often missed in utility code.",
    },
    {
      label: "SSRF URL validation",
      topic:
        "Incomplete outbound URL allowlist allowing internal SSRF requests",
      rationale: "Exercises boundary validation review habits.",
    },
  ],
  go: [
    {
      label: "Mutex unlock leak",
      topic: "Missing deferred mutex unlock on early error return path",
      rationale: "Classic Go concurrency defect causing silent deadlocks.",
    },
    {
      label: "Goroutine leak",
      topic: "Unbuffered channel send blocking goroutines after context cancel",
      rationale: "Builds skill spotting cancellation and resource leaks.",
    },
    {
      label: "Slice aliasing bug",
      topic: "Shared backing array mutation across concurrent slice appends",
      rationale: "Catches subtle data corruption in Go services.",
    },
  ],
  rust: [
    {
      label: "Lock across await",
      topic: "Holding a std MutexGuard across an async await boundary",
      rationale: "Key async Rust concurrency pitfall in Tokio services.",
    },
    {
      label: "Integer overflow panic",
      topic: "Unchecked arithmetic on untrusted length headers causing panic",
      rationale: "Focuses on boundary safety and DoS resilience.",
    },
    {
      label: "Path traversal check",
      topic: "Incomplete canonical path validation in static file handler",
      rationale: "Sharpens security review on filesystem boundaries.",
    },
  ],
  java: [
    {
      label: "Double-checked locking",
      topic: "Broken double-checked locking missing volatile on lazy singleton",
      rationale: "Targets memory visibility issues in concurrent Java code.",
    },
    {
      label: "Resource stream leak",
      topic: "Unclosed JDBC statement and connection on exception branch",
      rationale: "Builds precision on resource lifecycle reviews.",
    },
    {
      label: "Deserialization flaw",
      topic: "Unsafe object deserialization of untrusted request payload",
      rationale: "High-severity security pattern in Java backends.",
    },
  ],
}

const GENERAL_DEFAULT_TOPICS: readonly ConfigureChallengeTopicOption[] = [
  {
    label: "Auth & token validation",
    topic: "Authentication bypass via missing signature or role verification",
    rationale: "High-signal security review across any backend stack.",
  },
  {
    label: "Async race conditions",
    topic: "Concurrent read-modify-write race condition on shared state",
    rationale: "Builds recall for timing-sensitive concurrency defects.",
  },
  {
    label: "Input boundary flaws",
    topic: "Missing input validation enabling injection or path traversal",
    rationale: "Core defensive review habit for production endpoints.",
  },
]

export function stripControlChars(value: string): string {
  // Normalize line breaks to spaces before stripping control chars so words stay separated.
  const withoutBreaks = value.replace(/[\r\n]+/g, " ")
  let out = ""
  for (let i = 0; i < withoutBreaks.length; i += 1) {
    const code = withoutBreaks.charCodeAt(i)
    if (code >= 0x20 && code !== 0x7f) out += withoutBreaks[i]
  }
  return out.trim()
}

export function matchChoice<T extends string>(
  raw: unknown,
  allowed: readonly T[]
): T | undefined {
  if (typeof raw !== "string") return undefined
  const norm = raw.trim().toLowerCase()
  return allowed.find((item) => item.toLowerCase() === norm)
}

function sanitizeTopic(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined
  const cleaned = stripControlChars(raw).slice(0, 200).trim()
  if (cleaned.length < 3 || hasControlChars(cleaned)) return undefined
  return cleaned
}

function normalizeSuggestedTopics(
  rawTopics: unknown,
  language?: Language
): readonly ConfigureChallengeTopicOption[] {
  const result: ConfigureChallengeTopicOption[] = []
  const seen = new Set<string>()

  if (Array.isArray(rawTopics)) {
    for (const item of rawTopics) {
      if (result.length >= 4) break
      if (!item || typeof item !== "object" || Array.isArray(item)) continue
      const rec = item as Record<string, unknown>
      const topic = sanitizeTopic(rec.topic)
      if (!topic) continue
      const key = topic.toLowerCase()
      if (seen.has(key)) continue

      const rawLabel =
        typeof rec.label === "string" ? stripControlChars(rec.label) : ""
      const label = (rawLabel || topic).slice(0, 60).trim()
      if (!label) continue

      const rationale =
        typeof rec.rationale === "string"
          ? stripControlChars(rec.rationale).slice(0, 140).trim()
          : ""

      seen.add(key)
      result.push({
        label,
        topic,
        ...(rationale ? { rationale } : {}),
      })
    }
  }

  if (result.length > 0) return result
  return language
    ? DEFAULT_TOPICS_BY_LANGUAGE[language]
    : GENERAL_DEFAULT_TOPICS
}

export function normalizeConfigureChallengeInput(
  raw?: ConfigureChallengeInput
): NormalizedChallengeConfigInput {
  const rawPrompt =
    typeof raw?.prompt === "string"
      ? stripControlChars(raw.prompt).slice(0, 160).trim()
      : ""
  const language = matchChoice(raw?.language, LANGUAGES)
  const difficulty = matchChoice(raw?.difficulty, DIFFICULTIES)
  const topic = sanitizeTopic(raw?.topic)

  const prefilled: NormalizedChallengeConfigInput["prefilled"] = {
    ...(language ? { language } : {}),
    ...(difficulty ? { difficulty } : {}),
    ...(topic ? { topic } : {}),
  }

  const missingFields = ALL_CONFIG_FIELDS.filter(
    (field) => prefilled[field] === undefined
  )

  return {
    prompt: rawPrompt || "Configure your custom challenge",
    prefilled,
    missingFields,
    suggestedTopics: normalizeSuggestedTopics(raw?.suggestedTopics, language),
  }
}
