import * as React from "react"
import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CustomChallengeModal } from "@/components/challenges/generator-modal/custom-challenge-modal"
import { useCustomChallengeModalStore } from "@/stores/custom-challenge-modal-store"

const mockPush = vi.fn()
const mockGenerateCustomChallenge = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
  }),
}))

vi.mock("@/hooks/use-custom-challenges", () => ({
  isRequestTimeoutError: () => false,
  useCustomChallenges: () => ({
    customChallenges: [],
    total: 0,
    quotaLimit: 5,
    isQuotaFull: false,
    isLoading: false,
    quotaSyncState: "idle",
    resetQuotaSyncState: vi.fn(),
    deleteCustomChallenge: vi.fn(),
    toggleChallengeShare: vi.fn(),
    generateCustomChallenge: mockGenerateCustomChallenge,
  }),
}))

vi.mock("@/hooks/use-ai-connection", () => ({
  useAIConnection: () => ({
    isConnected: true,
    provider: "openai",
    model: "gpt-4o",
    baseUrl: null,
    maskedKey: "sk-o••••5678",
    isLoading: false,
    isValidating: false,
    isSaving: false,
    isDisconnecting: false,
    error: null,
    saveConnection: vi.fn(),
    disconnect: vi.fn(),
    mutate: vi.fn(),
  }),
}))

describe("CustomChallengeModal prefill handoff", () => {
  beforeEach(() => {
    useCustomChallengeModalStore.setState({
      isOpen: false,
      initialTab: "generate",
      prefill: null,
      prefillNonce: 0,
    })
    mockGenerateCustomChallenge.mockResolvedValue({
      slug: "generated-rust-lock",
      title: "Async Lock Ordering",
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("pre-fills topic, language, and difficulty when opened with prefill and resets after closing", async () => {
    const user = userEvent.setup()

    render(<CustomChallengeModal />)

    act(() => {
      useCustomChallengeModalStore
        .getState()
        .openCustomChallengeModal("generate", {
          topic: "Async lock ordering",
          language: "rust",
          difficulty: "Hard",
        })
    })

    const topicInput = await screen.findByTestId("generator-topic-input")
    expect(topicInput).toHaveValue("Async lock ordering")
    expect(screen.getByTestId("generator-language-select")).toHaveTextContent(
      "Rust"
    )
    expect(screen.getByRole("radio", { name: "Hard" })).toHaveAttribute(
      "data-state",
      "on"
    )

    await user.click(screen.getByTestId("generate-challenge-submit-btn"))

    expect(mockGenerateCustomChallenge).toHaveBeenCalledWith({
      topic: "Async lock ordering",
      language: "rust",
      difficulty: "Hard",
    })
    expect(useCustomChallengeModalStore.getState().isOpen).toBe(false)
    expect(useCustomChallengeModalStore.getState().prefill).toBeNull()

    act(() => {
      useCustomChallengeModalStore
        .getState()
        .openCustomChallengeModal("generate")
    })

    const freshTopicInput = await screen.findByTestId("generator-topic-input")
    expect(freshTopicInput).toHaveValue("")
    expect(screen.getByTestId("generator-language-select")).toHaveTextContent(
      "Python"
    )
    expect(screen.getByRole("radio", { name: "Medium" })).toHaveAttribute(
      "data-state",
      "on"
    )
  })
})
