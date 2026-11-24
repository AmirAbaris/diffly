import * as React from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CoachWorkspace } from "@/components/coach/coach-workspace"
import {
  COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
  type CoachPatternsSnapshot,
  type CoachUIMessage,
} from "@/lib/ai/coach"
import type { ChallengeSummary } from "@/types/challenge"
import {
  createConnectionState,
  SAMPLE_CUSTOM_CHALLENGE,
  SAMPLE_PATTERNS,
} from "./coach-test-fixtures"

const mockSendMessage = vi.fn()
const mockAddToolOutput = vi.fn()
const mockStop = vi.fn()
const mockSetMessages = vi.fn()
const mockClearError = vi.fn()
const mockGenerateCustomChallenge = vi.fn()
const mockDeleteCustomChallenge = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/coach",
}))

let mockChatState: {
  messages: CoachUIMessage[]
  status: "ready" | "submitted" | "streaming" | "error"
  error: Error | undefined
}

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    id: "test-chat",
    messages: mockChatState.messages,
    status: mockChatState.status,
    error: mockChatState.error,
    sendMessage: mockSendMessage,
    addToolOutput: mockAddToolOutput,
    stop: mockStop,
    setMessages: mockSetMessages,
    clearError: mockClearError,
  }),
}))

let mockConnectionState = createConnectionState()

vi.mock("@/hooks/use-ai-connection", () => ({
  useAIConnection: () => mockConnectionState,
}))

let mockPatternsState: {
  patterns: CoachPatternsSnapshot | null
  isLoading: boolean
  error: Error | null
  mutate: ReturnType<typeof vi.fn>
}

vi.mock("@/hooks/use-coach-patterns", () => ({
  useCoachPatterns: () => mockPatternsState,
}))

let mockCustomChallengesState: {
  customChallenges: ChallengeSummary[]
  total: number
  quotaLimit: number
  quotaRemaining: number
  isQuotaFull: boolean
  isLoading: boolean
  generateCustomChallenge: typeof mockGenerateCustomChallenge
  deleteCustomChallenge: typeof mockDeleteCustomChallenge
}

vi.mock("@/hooks/use-custom-challenges", () => ({
  useCustomChallenges: () => mockCustomChallengesState,
  isRequestTimeoutError: () => false,
}))

function buildConfigMessage(
  part: Extract<
    CoachUIMessage["parts"][number],
    { type: "tool-configure_challenge" }
  >
): CoachUIMessage[] {
  return [{ id: "assistant-cfg", role: "assistant", parts: [part] }]
}

describe("CoachChallengeConfigCard interactive flows", () => {
  beforeEach(() => {
    mockChatState = { messages: [], status: "ready", error: undefined }
    mockConnectionState = createConnectionState()
    mockPatternsState = {
      patterns: SAMPLE_PATTERNS,
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    }
    mockCustomChallengesState = {
      customChallenges: [SAMPLE_CUSTOM_CHALLENGE],
      total: 2,
      quotaLimit: 5,
      quotaRemaining: 3,
      isQuotaFull: false,
      isLoading: false,
      generateCustomChallenge: mockGenerateCustomChallenge,
      deleteCustomChallenge: mockDeleteCustomChallenge,
    }
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("renders all 3 missing fields for vague requests, submits via Continue, and calls addToolOutput", async () => {
    const user = userEvent.setup()
    mockGenerateCustomChallenge.mockResolvedValue({
      slug: "ts-cache-race",
      title: "Async Cache Race Condition",
    })
    mockChatState.messages = buildConfigMessage({
      type: "tool-configure_challenge",
      toolCallId: "cfg-vague",
      state: "input-available",
      input: {
        prompt: "Build your next review challenge",
        suggestedTopics: [
          {
            label: "Cache race",
            topic: "Async race condition in cache invalidation",
            rationale: "Targets low recall in async code.",
          },
        ],
      },
    })

    render(<CoachWorkspace />)

    expect(
      screen.getByTestId("coach-config-language-group")
    ).toBeInTheDocument()
    expect(
      screen.getByTestId("coach-config-difficulty-group")
    ).toBeInTheDocument()
    expect(screen.getByTestId("coach-config-topic-group")).toBeInTheDocument()

    await user.click(screen.getByRole("radio", { name: "TypeScript" }))
    await user.click(screen.getByRole("radio", { name: "Hard" }))
    await user.click(screen.getByTestId("coach-config-continue-button"))

    await waitFor(() => {
      expect(mockGenerateCustomChallenge).toHaveBeenCalledWith({
        language: "typescript",
        difficulty: "Hard",
        topic: "Async race condition in cache invalidation",
      })
    })
    expect(mockAddToolOutput).toHaveBeenCalledWith({
      tool: COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
      toolCallId: "cfg-vague",
      output: {
        status: "created",
        slug: "ts-cache-race",
        title: "Async Cache Race Condition",
        language: "typescript",
        difficulty: "Hard",
        topic: "Async race condition in cache invalidation",
      },
    })
  })

  it("renders only missing topic when language and difficulty are prefilled and supports Custom topic input", async () => {
    const user = userEvent.setup()
    mockGenerateCustomChallenge.mockResolvedValue({
      slug: "rust-tokio-deadlock",
      title: "Tokio Mutex Deadlock",
    })
    mockChatState.messages = buildConfigMessage({
      type: "tool-configure_challenge",
      toolCallId: "cfg-partial",
      state: "input-available",
      input: {
        language: "rust",
        difficulty: "Hard",
        suggestedTopics: [
          { label: "Lock across await", topic: "MutexGuard held across await" },
        ],
      },
    })

    render(<CoachWorkspace />)

    expect(
      screen.getByTestId("coach-config-prefilled-language")
    ).toHaveTextContent("Rust")
    expect(
      screen.getByTestId("coach-config-prefilled-difficulty")
    ).toHaveTextContent("Hard")
    expect(
      screen.queryByTestId("coach-config-language-group")
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("coach-config-difficulty-group")
    ).not.toBeInTheDocument()

    await user.click(screen.getByTestId("coach-config-topic-custom-toggle"))
    const customInput = screen.getByTestId("coach-config-custom-topic-input")
    expect(screen.getByTestId("coach-config-continue-button")).toBeDisabled()

    await user.type(customInput, "Tokio rwlock starvation under load")
    await user.click(screen.getByTestId("coach-config-continue-button"))

    await waitFor(() => {
      expect(mockGenerateCustomChallenge).toHaveBeenCalledWith({
        language: "rust",
        difficulty: "Hard",
        topic: "Tokio rwlock starvation under load",
      })
    })
  })

  it("handles Cancel, quota-full dismissal, transient error retry, and immutable output-available views", async () => {
    const user = userEvent.setup()
    mockGenerateCustomChallenge
      .mockRejectedValueOnce(new Error("Upstream 502"))
      .mockResolvedValueOnce({
        slug: "py-jwt-retry",
        title: "FastAPI JWT Verification",
      })

    mockChatState.messages = buildConfigMessage({
      type: "tool-configure_challenge",
      toolCallId: "cfg-retry",
      state: "input-available",
      input: { language: "python", difficulty: "Medium", topic: "JWT bypass" },
    })

    const { rerender } = render(<CoachWorkspace />)

    await user.click(screen.getByTestId("coach-config-continue-button"))
    expect(await screen.findByTestId("coach-config-error")).toHaveTextContent(
      "Upstream 502"
    )
    expect(mockAddToolOutput).not.toHaveBeenCalled()

    await user.click(screen.getByTestId("coach-config-retry-button"))
    await waitFor(() => {
      expect(mockAddToolOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          toolCallId: "cfg-retry",
          output: expect.objectContaining({
            status: "created",
            slug: "py-jwt-retry",
          }),
        })
      )
    })

    mockChatState.messages = buildConfigMessage({
      type: "tool-configure_challenge",
      toolCallId: "cfg-created",
      state: "output-available",
      input: { language: "python", difficulty: "Medium", topic: "JWT bypass" },
      output: {
        status: "created",
        slug: "py-jwt-retry",
        title: "FastAPI JWT Verification",
        language: "python",
        difficulty: "Medium",
        topic: "JWT bypass",
      },
    })
    rerender(<CoachWorkspace />)
    const openLink = screen.getByTestId("coach-config-open-challenge")
    expect(openLink).toHaveAttribute("href", "/challenges/py-jwt-retry")
    expect(openLink).toHaveTextContent("Start Review in Arena")

    mockAddToolOutput.mockClear()
    mockCustomChallengesState = {
      ...mockCustomChallengesState,
      total: 5,
      quotaRemaining: 0,
      isQuotaFull: true,
    }
    mockChatState.messages = buildConfigMessage({
      type: "tool-configure_challenge",
      toolCallId: "cfg-quota",
      state: "input-available",
      input: { language: "go", difficulty: "Easy", topic: "Mutex unlock leak" },
    })
    rerender(<CoachWorkspace />)

    expect(screen.getByTestId("coach-config-quota-alert")).toHaveTextContent(
      "Library full (5/5)"
    )
    expect(screen.getByTestId("coach-config-continue-button")).toBeDisabled()
    await user.click(screen.getByTestId("coach-config-quota-dismiss-button"))
    expect(mockAddToolOutput).toHaveBeenCalledWith({
      tool: COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
      toolCallId: "cfg-quota",
      output: { status: "quota_full", quotaLimit: 5 },
    })

    mockAddToolOutput.mockClear()
    mockCustomChallengesState = {
      ...mockCustomChallengesState,
      total: 2,
      quotaRemaining: 3,
      isQuotaFull: false,
    }
    mockChatState.messages = buildConfigMessage({
      type: "tool-configure_challenge",
      toolCallId: "cfg-cancel",
      state: "input-available",
      input: { language: "go", difficulty: "Easy", topic: "Mutex unlock leak" },
    })
    rerender(<CoachWorkspace />)
    await user.click(screen.getByTestId("coach-config-cancel-button"))
    expect(mockAddToolOutput).toHaveBeenCalledWith({
      tool: COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
      toolCallId: "cfg-cancel",
      output: { status: "cancelled" },
    })
  })

  it("auto-cancels pending configure_challenge tool calls when the user sends a new chat message", async () => {
    const user = userEvent.setup()
    mockAddToolOutput.mockResolvedValue(undefined)
    mockChatState.messages = buildConfigMessage({
      type: "tool-configure_challenge",
      toolCallId: "cfg-orphan",
      state: "input-available",
      input: { language: "python" },
    })

    render(<CoachWorkspace />)

    await user.type(
      screen.getByTestId("coach-composer-input"),
      "Actually explain my last score"
    )
    await user.click(screen.getByTestId("coach-send-button"))

    await waitFor(() => {
      expect(mockAddToolOutput).toHaveBeenCalledWith({
        tool: COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
        toolCallId: "cfg-orphan",
        output: { status: "cancelled" },
      })
      expect(mockSendMessage).toHaveBeenCalledWith({
        text: "Actually explain my last score",
      })
    })
  })
})
