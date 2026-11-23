"use client"

import * as React from "react"
import axios from "axios"
import useSWR, { useSWRConfig, type KeyedMutator } from "swr"
import {
  type AIConnectionMetadata,
  type AIProviderId,
  type SaveAIConnectionInput,
} from "@/lib/ai/catalog"
import { apiClient } from "@/lib/axios"

export type {
  AIConnectionMetadata,
  AIProviderId,
  SaveAIConnectionInput,
} from "@/lib/ai/catalog"

export const AI_CONNECTION_SWR_KEY = "/api/ai/connection"
export const AI_CONNECTION_VERIFY_TIMEOUT_MS = 30_000
export const LEGACY_GEMINI_STORAGE_KEY = "diffly_gemini_key"

export interface UseAIConnectionResult {
  isConnected: boolean
  provider: AIProviderId | null
  model: string | null
  baseUrl: string | null
  maskedKey: string | null
  isLoading: boolean
  isValidating: boolean
  isSaving: boolean
  isDisconnecting: boolean
  error: Error | null
  saveConnection: (
    input: SaveAIConnectionInput
  ) => Promise<AIConnectionMetadata>
  disconnect: () => Promise<void>
  mutate: KeyedMutator<AIConnectionMetadata>
}

function scrubLegacyGeminiKey(): void {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.removeItem(LEGACY_GEMINI_STORAGE_KEY)
  } catch {
    // Ignore storage errors in restricted browser contexts
  }
}

function resolveConnectionErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      { error?: unknown; detail?: unknown } | undefined
    if (typeof data?.error === "string" && data.error.trim()) {
      return data.error.trim()
    }
    if (typeof data?.detail === "string" && data.detail.trim()) {
      return data.detail.trim()
    }
    if (err.message) {
      return err.message
    }
  }
  if (err instanceof Error && err.message) {
    return err.message
  }
  return fallback
}

export function useAIConnection(): UseAIConnectionResult {
  const swrConfig = useSWRConfig()
  const contextFetcher = swrConfig?.fetcher

  const fetcher = React.useCallback(
    async (key: string): Promise<AIConnectionMetadata> => {
      if (typeof contextFetcher === "function") {
        const result = await contextFetcher(key)
        return (result as AIConnectionMetadata | null) ?? { connected: false }
      }
      const response = await apiClient.get<AIConnectionMetadata>(key)
      return response.data
    },
    [contextFetcher]
  )

  const {
    data,
    error: swrError,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<AIConnectionMetadata>(AI_CONNECTION_SWR_KEY, fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  const [isSaving, setIsSaving] = React.useState(false)
  const [isDisconnecting, setIsDisconnecting] = React.useState(false)
  const [actionError, setActionError] = React.useState<Error | null>(null)

  React.useEffect(() => {
    scrubLegacyGeminiKey()
  }, [])

  const saveConnection = React.useCallback(
    async (input: SaveAIConnectionInput): Promise<AIConnectionMetadata> => {
      setIsSaving(true)
      setActionError(null)
      try {
        const response = await apiClient.post<AIConnectionMetadata>(
          AI_CONNECTION_SWR_KEY,
          input,
          {
            timeout: AI_CONNECTION_VERIFY_TIMEOUT_MS,
          }
        )
        await mutate(response.data, { revalidate: false })
        scrubLegacyGeminiKey()
        return response.data
      } catch (err: unknown) {
        const message = resolveConnectionErrorMessage(
          err,
          "Failed to verify AI provider connection."
        )
        const normalized = new Error(message)
        setActionError(normalized)
        throw normalized
      } finally {
        setIsSaving(false)
      }
    },
    [mutate]
  )

  const disconnect = React.useCallback(async (): Promise<void> => {
    setIsDisconnecting(true)
    setActionError(null)
    try {
      await apiClient.delete<AIConnectionMetadata>(AI_CONNECTION_SWR_KEY)
      await mutate({ connected: false }, { revalidate: false })
      scrubLegacyGeminiKey()
    } catch (err: unknown) {
      const message = resolveConnectionErrorMessage(
        err,
        "Failed to disconnect AI provider."
      )
      const normalized = new Error(message)
      setActionError(normalized)
      throw normalized
    } finally {
      setIsDisconnecting(false)
    }
  }, [mutate])

  const isConnected = data?.connected === true
  const provider = data?.connected ? data.provider : null
  const model = data?.connected ? data.model : null
  const baseUrl = data?.connected ? (data.baseUrl ?? null) : null
  const maskedKey = data?.connected ? data.maskedKey : null

  const normalizedSwrError =
    swrError instanceof Error
      ? swrError
      : swrError
        ? new Error(String(swrError))
        : null

  return {
    isConnected,
    provider,
    model,
    baseUrl,
    maskedKey,
    isLoading,
    isValidating,
    isSaving,
    isDisconnecting,
    error: actionError ?? normalizedSwrError,
    saveConnection,
    disconnect,
    mutate,
  }
}
