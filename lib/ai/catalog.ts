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
  readonly subtitle: string
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
    subtitle: "Gemini 3.8 & 4",
    defaultModel: "gemini-3.8-flash",
    suggestedModels: [
      "gemini-3.8-flash",
      "gemini-3.5-flash-lite",
      "gemini-4-argon",
      "gemini-flash-latest",
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
    subtitle: "GPT-6 family",
    defaultModel: "gpt-6.2-sol",
    suggestedModels: [
      "gpt-6.2-sol",
      "gpt-6.1-terra",
      "gpt-6-luna",
      "gpt-6.2-astra",
    ],
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
    subtitle: "Claude 5.5 family",
    defaultModel: "claude-sonnet-5-5",
    suggestedModels: [
      "claude-sonnet-5-5",
      "claude-haiku-5-5",
      "claude-opus-5-5",
      "claude-fable-5-2",
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
    subtitle: "Custom endpoint",
    defaultModel: "deepseek-chat",
    suggestedModels: [
      "deepseek-chat",
      "llama-3.3-70b-instruct",
      "qwen-2.5-coder-32b-instruct",
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
