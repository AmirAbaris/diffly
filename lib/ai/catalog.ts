export const AI_PROVIDERS = [
  "google",
  "openai",
  "anthropic",
  "openai-compatible",
] as const

export type AIProviderId = (typeof AI_PROVIDERS)[number]

export interface AIProviderCatalogEntry {
  readonly id: AIProviderId
  readonly label: string
  readonly shortLabel: string
  readonly defaultModel: string
  readonly suggestedModels: readonly string[]
  readonly baseUrlRequired: boolean
  readonly baseUrlPlaceholder: string
  readonly apiKeyPlaceholder: string
  readonly keyPortalUrl?: string
  readonly keyPortalLabel?: string
}

export const AI_PROVIDER_CATALOG: Readonly<
  Record<AIProviderId, AIProviderCatalogEntry>
> = {
  google: {
    id: "google",
    label: "Google Gemini",
    shortLabel: "Gemini",
    defaultModel: "gemini-2.5-flash",
    suggestedModels: [
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.5-flash-lite",
    ],
    baseUrlRequired: false,
    baseUrlPlaceholder: "https://generativelanguage.googleapis.com/v1beta",
    apiKeyPlaceholder: "AIza...",
    keyPortalUrl: "https://aistudio.google.com/app/apikey",
    keyPortalLabel: "Google AI Studio",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    shortLabel: "OpenAI",
    defaultModel: "gpt-4.1-mini",
    suggestedModels: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "o4-mini"],
    baseUrlRequired: false,
    baseUrlPlaceholder: "https://api.openai.com/v1",
    apiKeyPlaceholder: "sk-...",
    keyPortalUrl: "https://platform.openai.com/api-keys",
    keyPortalLabel: "OpenAI API Keys",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    shortLabel: "Anthropic",
    defaultModel: "claude-sonnet-4-5",
    suggestedModels: [
      "claude-sonnet-4-5",
      "claude-haiku-4-5",
      "claude-opus-4-5",
    ],
    baseUrlRequired: false,
    baseUrlPlaceholder: "https://api.anthropic.com/v1",
    apiKeyPlaceholder: "sk-ant-...",
    keyPortalUrl: "https://console.anthropic.com/settings/keys",
    keyPortalLabel: "Anthropic Console",
  },
  "openai-compatible": {
    id: "openai-compatible",
    label: "OpenAI-compatible",
    shortLabel: "OpenAI-compatible",
    defaultModel: "llama-3.3-70b-instruct",
    suggestedModels: [
      "llama-3.3-70b-instruct",
      "qwen-2.5-coder-32b-instruct",
      "deepseek-chat",
    ],
    baseUrlRequired: true,
    baseUrlPlaceholder: "https://api.together.xyz/v1",
    apiKeyPlaceholder: "sk-...",
  },
}

export type AIConnectionMetadata =
  | { connected: false }
  | {
      connected: true
      provider: AIProviderId
      model: string
      baseUrl?: string
      maskedKey: string
    }

export interface SaveAIConnectionInput {
  provider: AIProviderId
  model: string
  apiKey: string
  baseUrl?: string
}

export function formatAIProviderLabel(
  provider: AIProviderId | null | undefined
): string {
  if (!provider) {
    return ""
  }

  return AI_PROVIDER_CATALOG[provider]?.label ?? ""
}

export function formatAIConnectionSummary(connection: {
  isConnected: boolean
  provider: AIProviderId | null
  model: string | null
}): string | null {
  if (!connection.isConnected || !connection.provider) {
    return null
  }

  const label = formatAIProviderLabel(connection.provider)
  if (!label) {
    return null
  }

  const model = connection.model?.trim()
  return model ? `${label} (${model})` : label
}
