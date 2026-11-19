import { act, renderHook } from "@testing-library/react"
import { AxiosError } from "axios"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  CUSTOM_CHALLENGE_GENERATE_TIMEOUT_MS,
  CUSTOM_CHALLENGES_SWR_KEY,
  isRequestTimeoutError,
  useCustomChallenges,
} from "@/hooks/use-custom-challenges"
import { apiClient } from "@/lib/axios"

const mockMutate = vi.fn()
const mockGlobalMutate = vi.fn()

vi.mock("swr", () => ({
  default: () => ({
    data: { items: [], total: 1, quota_limit: 5, quota_remaining: 4 },
    error: undefined,
    isLoading: false,
    isValidating: false,
    mutate: mockMutate,
  }),
  mutate: (...args: unknown[]) => mockGlobalMutate(...args),
}))

describe("useCustomChallenges timeout and quota-sync behavior", () => {
  beforeEach(() => {
    mockMutate.mockReset()
    mockGlobalMutate.mockReset()
    mockMutate.mockResolvedValue(undefined)
    mockGlobalMutate.mockResolvedValue(undefined)
  })

  it("keeps apiClient default timeout at 10s while passing extended timeout on generateCustomChallenge", async () => {
    expect(apiClient.defaults.timeout).toBe(10000)
    expect(CUSTOM_CHALLENGE_GENERATE_TIMEOUT_MS).toBeGreaterThanOrEqual(45000)

    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValueOnce({
      data: { id: 1, slug: "test-slug", title: "Test" },
    })

    const { result } = renderHook(() => useCustomChallenges())

    await act(async () => {
      await result.current.generateCustomChallenge(
        { topic: "SQL injection", language: "python", difficulty: "Medium" },
        "  AIzaSyKey  "
      )
    })

    expect(postSpy).toHaveBeenCalledWith(
      "/api/challenges/generate-custom",
      { topic: "SQL injection", language: "python", difficulty: "Medium" },
      {
        timeout: CUSTOM_CHALLENGE_GENERATE_TIMEOUT_MS,
        headers: { "X-Gemini-Key": "AIzaSyKey" },
      }
    )
    expect(mockMutate).toHaveBeenCalledTimes(1)
    expect(mockGlobalMutate).toHaveBeenCalledWith("/api/challenges")
    expect(result.current.quotaSyncState).toBe("idle")
    postSpy.mockRestore()
  })

  it("resyncs quota via SWR mutate and updates quotaSyncState when generateCustomChallenge times out", async () => {
    const timeoutErr = new AxiosError(
      "timeout of 60000ms exceeded",
      "ECONNABORTED"
    )
    const postSpy = vi
      .spyOn(apiClient, "post")
      .mockRejectedValueOnce(timeoutErr)

    const { result } = renderHook(() => useCustomChallenges())
    expect(result.current.quotaSyncState).toBe("idle")

    await act(async () => {
      await expect(
        result.current.generateCustomChallenge(
          { topic: "Race condition", language: "go", difficulty: "Hard" },
          "AIzaSyKey"
        )
      ).rejects.toBe(timeoutErr)
    })

    expect(mockMutate).toHaveBeenCalledTimes(1)
    expect(mockGlobalMutate).toHaveBeenCalledWith("/api/challenges")
    expect(result.current.quotaSyncState).toBe("synced")
    expect(result.current.isSyncingQuota).toBe(false)
    expect(CUSTOM_CHALLENGES_SWR_KEY).toBe("/api/challenges/custom")
    postSpy.mockRestore()
  })

  it("detects Axios timeout errors accurately", () => {
    expect(
      isRequestTimeoutError(new AxiosError("timeout", "ECONNABORTED"))
    ).toBe(true)
    expect(isRequestTimeoutError(new AxiosError("timeout", "ETIMEDOUT"))).toBe(
      true
    )
    expect(
      isRequestTimeoutError(new AxiosError("Unauthorized", "ERR_BAD_REQUEST"))
    ).toBe(false)
    expect(isRequestTimeoutError(new Error("timeout"))).toBe(false)
  })
})
