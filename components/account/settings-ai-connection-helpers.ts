import type { UseAIConnectionResult } from "@/hooks/use-ai-connection"
import { AI_PROVIDER_CATALOG, type AIProviderId } from "@/lib/ai/catalog"

export function resolveAIConnectionDraft(
  conn: UseAIConnectionResult,
  provider: AIProviderId | null,
  model: string | null,
  baseUrl: string | null
) {
  const activeProvider: AIProviderId = provider ?? conn.provider ?? "google"
  const entry = AI_PROVIDER_CATALOG[activeProvider]
  const useSaved =
    provider === null || (conn.isConnected && provider === conn.provider)
  const modelValue =
    model ?? (useSaved && conn.model ? conn.model : entry.defaultModel)
  const baseUrlValue = baseUrl ?? (useSaved && conn.baseUrl ? conn.baseUrl : "")
  const hasBaseUrl = !entry.baseUrlRequired || Boolean(baseUrlValue.trim())

  return { activeProvider, entry, modelValue, baseUrlValue, hasBaseUrl }
}

export function toAIConnectionErrorMessage(
  err: unknown,
  fallback: string
): string {
  return err instanceof Error ? err.message : fallback
}
