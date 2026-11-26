import * as React from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { AxiosError, type AxiosResponse } from "axios"
import { SWRConfig } from "swr"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  AI_CONNECTION_SWR_KEY,
  AI_CONNECTION_VERIFY_TIMEOUT_MS,
  LEGACY_GEMINI_STORAGE_KEY,
  useAIConnection,
} from "@/hooks/use-ai-connection"
import { apiClient } from "@/lib/axios"

function createWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        {children}
      </SWRConfig>
    )
  }
}

describe("useAIConnection", () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it("fetches GET /api/ai/connection status and scrubs legacy diffly_gemini_key on mount", async () => {
    window.localStorage.setItem(LEGACY_GEMINI_STORAGE_KEY, "AIzaSyLegacyPlain")

    const getSpy = vi.spyOn(apiClient, "get").mockResolvedValueOnce({
      data: {
        connected: true,
        provider: "anthropic",
        model: "claude-sonnet-5-5",
        maskedKey: "sk-a••••9876",
      },
    })

    const { result } = renderHook(() => useAIConnection(), {
      wrapper: createWrapper(),
    })

    expect(window.localStorage.getItem(LEGACY_GEMINI_STORAGE_KEY)).toBeNull()

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
    })

    expect(getSpy).toHaveBeenCalledWith(AI_CONNECTION_SWR_KEY)
    expect(result.current.provider).toBe("anthropic")
    expect(result.current.model).toBe("claude-sonnet-5-5")
    expect(result.current.baseUrl).toBeNull()
    expect(result.current.maskedKey).toBe("sk-a••••9876")
  })

  it("posts to /api/ai/connection on saveConnection, updates SWR cache without revalidation, and scrubs legacy key", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({
      data: { connected: false },
    })

    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValueOnce({
      data: {
        connected: true,
        provider: "openai",
        model: "gpt-6.2-sol",
        maskedKey: "sk-p••••4321",
      },
    })

    const { result } = renderHook(() => useAIConnection(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.isConnected).toBe(false)

    window.localStorage.setItem(LEGACY_GEMINI_STORAGE_KEY, "AIzaSyStale")

    await act(async () => {
      await result.current.saveConnection({
        provider: "openai",
        model: "gpt-6.2-sol",
        apiKey: "sk-proj-secret-4321",
      })
    })

    expect(postSpy).toHaveBeenCalledWith(
      AI_CONNECTION_SWR_KEY,
      {
        provider: "openai",
        model: "gpt-6.2-sol",
        apiKey: "sk-proj-secret-4321",
      },
      { timeout: AI_CONNECTION_VERIFY_TIMEOUT_MS }
    )
    expect(result.current.isConnected).toBe(true)
    expect(result.current.provider).toBe("openai")
    expect(result.current.model).toBe("gpt-6.2-sol")
    expect(result.current.maskedKey).toBe("sk-p••••4321")
    expect(window.localStorage.getItem(LEGACY_GEMINI_STORAGE_KEY)).toBeNull()
  })

  it("surfaces normalized Error message when saveConnection fails", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({
      data: { connected: false },
    })

    const axiosErr = new AxiosError(
      "Request failed with status code 401",
      "ERR_BAD_REQUEST",
      undefined,
      undefined,
      {
        status: 401,
        statusText: "Unauthorized",
        headers: {},
        config: {} as AxiosResponse["config"],
        data: {
          error: "Provider rejected the API key. Check your credentials.",
        },
      }
    )
    vi.spyOn(apiClient, "post").mockRejectedValueOnce(axiosErr)

    const { result } = renderHook(() => useAIConnection(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await expect(
        result.current.saveConnection({
          provider: "google",
          model: "gemini-3.8-flash",
          apiKey: "invalid-key",
        })
      ).rejects.toThrow(
        "Provider rejected the API key. Check your credentials."
      )
    })

    expect(result.current.error?.message).toBe(
      "Provider rejected the API key. Check your credentials."
    )
    expect(result.current.isConnected).toBe(false)
  })

  it("sends DELETE /api/ai/connection on disconnect and resets connection state", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({
      data: {
        connected: true,
        provider: "google",
        model: "gemini-3.8-flash",
        maskedKey: "AIza••••1234",
      },
    })
    const deleteSpy = vi.spyOn(apiClient, "delete").mockResolvedValueOnce({
      data: { connected: false },
    })

    const { result } = renderHook(() => useAIConnection(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
    })

    window.localStorage.setItem(LEGACY_GEMINI_STORAGE_KEY, "AIzaSyStale")

    await act(async () => {
      await result.current.disconnect()
    })

    expect(deleteSpy).toHaveBeenCalledWith(AI_CONNECTION_SWR_KEY)
    expect(result.current.isConnected).toBe(false)
    expect(result.current.provider).toBeNull()
    expect(result.current.model).toBeNull()
    expect(result.current.maskedKey).toBeNull()
    expect(window.localStorage.getItem(LEGACY_GEMINI_STORAGE_KEY)).toBeNull()
  })
})
