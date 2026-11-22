import * as React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GeneratorForm } from "@/components/challenges/generator-modal/generator-form"
import type { AIProviderId } from "@/lib/ai/catalog"
import { useCustomChallengeModalStore } from "@/stores/custom-challenge-modal-store"

let mockConnectionState: {
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
  saveConnection: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  mutate: ReturnType<typeof vi.fn>
}

vi.mock("@/hooks/use-ai-connection", () => ({
  useAIConnection: () => mockConnectionState,
}))

describe("GeneratorForm Component", () => {
  beforeEach(() => {
    useCustomChallengeModalStore.setState({
      isOpen: true,
      initialTab: "generate",
    })
    mockConnectionState = {
      isConnected: true,
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      baseUrl: null,
      maskedKey: "sk-a••••1234",
      isLoading: false,
      isValidating: false,
      isSaving: false,
      isDisconnecting: false,
      error: null,
      saveConnection: vi.fn(),
      disconnect: vi.fn(),
      mutate: vi.fn(),
    }
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("renders connected status pill with Manage in Settings link, omits API key input, and submits topic/language/difficulty", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const onCloseModal = vi.fn()

    render(
      <GeneratorForm
        isQuotaFull={false}
        isGenerating={false}
        errorMessage={null}
        onSubmit={onSubmit}
        onSwitchToManage={vi.fn()}
        onCloseModal={onCloseModal}
      />
    )

    expect(
      screen.queryByTestId("generator-api-key-input")
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("remember-key-checkbox")
    ).not.toBeInTheDocument()

    expect(screen.getByTestId("generator-ai-status-pill")).toHaveTextContent(
      "Connected: Anthropic (claude-sonnet-4-5)"
    )

    const manageLink = screen.getByTestId("generator-manage-settings-link")
    expect(manageLink).toHaveAttribute("href", "/settings")

    await user.type(
      screen.getByTestId("generator-topic-input"),
      "FastAPI JWT authentication bypass"
    )

    const submitBtn = screen.getByTestId("generate-challenge-submit-btn")
    expect(submitBtn).toBeEnabled()
    await user.click(submitBtn)

    expect(onSubmit).toHaveBeenCalledWith({
      topic: "FastAPI JWT authentication bypass",
      language: "python",
      difficulty: "Medium",
    })

    await user.click(manageLink)
    expect(useCustomChallengeModalStore.getState().isOpen).toBe(false)
    expect(onCloseModal).toHaveBeenCalledTimes(1)
  })

  it("renders disconnected CTA linking to /settings and disables Generate Challenge submit button", async () => {
    const user = userEvent.setup()
    mockConnectionState = {
      ...mockConnectionState,
      isConnected: false,
      provider: null,
      model: null,
      maskedKey: null,
    }
    const onSubmit = vi.fn()
    const onCloseModal = vi.fn()

    render(
      <GeneratorForm
        isQuotaFull={false}
        isGenerating={false}
        errorMessage={null}
        onSubmit={onSubmit}
        onSwitchToManage={vi.fn()}
        onCloseModal={onCloseModal}
      />
    )

    expect(
      screen.getByTestId("generator-ai-disconnected-cta")
    ).toBeInTheDocument()
    const settingsLink = screen.getByTestId("generator-configure-settings-link")
    expect(settingsLink).toHaveAttribute("href", "/settings")

    await user.type(
      screen.getByTestId("generator-topic-input"),
      "Go mutex deadlock in cache"
    )

    const submitBtn = screen.getByTestId("generate-challenge-submit-btn")
    expect(submitBtn).toBeDisabled()

    await user.click(settingsLink)
    expect(useCustomChallengeModalStore.getState().isOpen).toBe(false)
    expect(onCloseModal).toHaveBeenCalledTimes(1)
  })

  it("renders a loading skeleton while AI connection status is loading", () => {
    mockConnectionState = {
      ...mockConnectionState,
      isConnected: false,
      provider: null,
      model: null,
      maskedKey: null,
      isLoading: true,
    }

    render(
      <GeneratorForm
        isQuotaFull={false}
        isGenerating={false}
        errorMessage={null}
        onSubmit={vi.fn()}
        onSwitchToManage={vi.fn()}
      />
    )

    expect(
      screen.getByTestId("generator-ai-status-skeleton")
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId("generator-ai-connected-banner")
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("generator-ai-disconnected-cta")
    ).not.toBeInTheDocument()
    expect(screen.getByTestId("generate-challenge-submit-btn")).toBeDisabled()
  })
})
