import rawManifest from "@/backend/models/languages.json"
import type { Language } from "@/types/challenge"

export interface ChallengeLanguageOption {
  value: Language
  label: string
}

export interface NormalizeLanguageOptions {
  fallback?: string
  preserveUnknown?: boolean
}

interface ChallengeManifestEntry {
  readonly id: string
  readonly label: string
  readonly runtime: string
  readonly defaultFileName: string
  readonly prismLanguage: string
  readonly extensions: readonly string[]
  readonly aliases: readonly string[]
}

interface AuxiliaryManifestEntry {
  readonly id: string
  readonly label: string
  readonly defaultFileName: string
  readonly prismLanguage: string
  readonly extensions: readonly string[]
  readonly aliases: readonly string[]
}

const CHALLENGE_ENTRIES: readonly ChallengeManifestEntry[] =
  rawManifest.challengeLanguages
const AUXILIARY_ENTRIES: readonly AuxiliaryManifestEntry[] =
  rawManifest.auxiliaryLanguages

const CHALLENGE_SPECS = new Map<Language, ChallengeManifestEntry>()
const CHALLENGE_ALIAS_TO_ID = new Map<string, Language>()
const ALIAS_TO_PRISM = new Map<string, string>()
const ALIAS_TO_LABEL = new Map<string, string>()
const EXT_TO_PRISM = new Map<string, string>()
const DEFAULT_FILE_BY_PRISM = new Map<string, string>()

for (const entry of CHALLENGE_ENTRIES) {
  const id = entry.id as Language
  CHALLENGE_SPECS.set(id, entry)
  CHALLENGE_ALIAS_TO_ID.set(entry.id.toLowerCase(), id)

  for (const alias of entry.aliases) {
    CHALLENGE_ALIAS_TO_ID.set(alias.toLowerCase(), id)
  }
}

for (const entry of [...CHALLENGE_ENTRIES, ...AUXILIARY_ENTRIES]) {
  const idKey = entry.id.toLowerCase()
  const prismKey = entry.prismLanguage.toLowerCase()

  ALIAS_TO_PRISM.set(idKey, entry.prismLanguage)
  ALIAS_TO_PRISM.set(prismKey, entry.prismLanguage)
  ALIAS_TO_LABEL.set(idKey, entry.label)
  ALIAS_TO_LABEL.set(prismKey, entry.label)
  DEFAULT_FILE_BY_PRISM.set(entry.prismLanguage, entry.defaultFileName)

  for (const alias of entry.aliases) {
    const aliasKey = alias.toLowerCase()
    ALIAS_TO_PRISM.set(aliasKey, entry.prismLanguage)
    ALIAS_TO_LABEL.set(aliasKey, entry.label)
  }

  for (const ext of entry.extensions) {
    const dotless = ext.replace(/^\./, "").toLowerCase()
    EXT_TO_PRISM.set(dotless, entry.prismLanguage)
  }
}

export const SUPPORTED_LANGUAGE_IDS = CHALLENGE_ENTRIES.map(
  (entry) => entry.id as Language
) as unknown as readonly [Language, ...Language[]]

export const CHALLENGE_LANGUAGES: ReadonlyArray<ChallengeLanguageOption> =
  CHALLENGE_ENTRIES.map((entry) => ({
    value: entry.id as Language,
    label: entry.label,
  }))

export function isSupportedLanguage(value: unknown): value is Language {
  return typeof value === "string" && CHALLENGE_SPECS.has(value as Language)
}

export function formatSupportedLanguagesList(): string {
  const ids = SUPPORTED_LANGUAGE_IDS
  if (ids.length === 0) return ""
  if (ids.length === 1) return ids[0]
  if (ids.length === 2) return `${ids[0]} or ${ids[1]}`
  return `${ids.slice(0, -1).join(", ")}, or ${ids[ids.length - 1]}`
}

export function formatLanguageLabel(language: string): string {
  const normalized = language.toLowerCase().trim()
  return ALIAS_TO_LABEL.get(normalized) ?? language
}

export function getRuntimeLabel(language: Language | string): string {
  const normalized = language.toLowerCase().trim()
  const canonicalId = CHALLENGE_ALIAS_TO_ID.get(normalized)
  if (!canonicalId) return language
  return CHALLENGE_SPECS.get(canonicalId)?.runtime ?? language
}

export function inferLanguageFromPath(
  filePath?: string,
  fallback = "python"
): string {
  if (!filePath) return fallback
  const dotIdx = filePath.lastIndexOf(".")
  const slashIdx = Math.max(
    filePath.lastIndexOf("/"),
    filePath.lastIndexOf("\\")
  )
  if (dotIdx === -1 || dotIdx < slashIdx) return fallback

  const ext = filePath.slice(dotIdx + 1).toLowerCase()
  return EXT_TO_PRISM.get(ext) ?? fallback
}

export function normalizeCodeLanguage(
  language?: string,
  options?: NormalizeLanguageOptions
): string {
  const fallback = options?.fallback ?? "python"
  const preserveUnknown = options?.preserveUnknown ?? false
  const clean = (language ?? "").toLowerCase().trim()
  if (!clean) return fallback

  const matched = ALIAS_TO_PRISM.get(clean)
  if (matched) return matched

  return preserveUnknown ? clean : fallback
}

export function resolveCodeFileName(
  normalizedLanguage: string,
  explicitFileName?: string
): string {
  if (explicitFileName) return explicitFileName
  return DEFAULT_FILE_BY_PRISM.get(normalizedLanguage) ?? "solution.ts"
}
