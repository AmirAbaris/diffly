import * as React from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CoachWorkspace } from "@/components/coach/coach-workspace"
import {
  COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
  getDefaultTopicsForLanguage,
  type CoachUIMessage,
} from "@/lib/ai/coach"
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
    ...mockChatState,
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

const defaultPatterns = () => ({
  patterns: SAMPLE_PATTERNS,
  isLoading: false,
  error: null as Error | null,
  mutate: vi.fn(),
})
let mockPatternsState = defaultPatterns()
vi.mock("@/hooks/use-coach-patterns", () => ({
  useCoachPatterns: () => mockPatternsState,
}))

const defaultCustomChallenges = (overrides?: {
  total?: number
  quotaRemaining?: number
  isQuotaFull?: boolean
}) => ({
  customChallenges: [SAMPLE_CUSTOM_CHALLENGE],
  total: 2,
  quotaLimit: 5,
  quotaRemaining: 3,
  isQuotaFull: false,
  isLoading: false,
  generateCustomChallenge: mockGenerateCustomChallenge,
  deleteCustomChallenge: mockDeleteCustomChallenge,
  ...overrides,
})
let mockCustomChallengesState = defaultCustomChallenges()
vi.mock("@/hooks/use-custom-challenges", () => ({
  useCustomChallenges: () => mockCustomChallengesState,
  isRequestTimeoutError: () => false,
}))

type ConfigPart = Extract<
  CoachUIMessage["parts"][number],
  { type: "tool-configure_challenge" }
>

function setConfigPart(
  part: ConfigPart extends infer P ? Omit<P, "type"> : never
) {
  mockChatState.messages = [
    {
      id: "assistant-cfg",
      role: "assistant",
      parts: [{ type: "tool-configure_challenge", ...part } as ConfigPart],
    },
  ]
}

function expectStep(label: string) {
  expect(screen.getByTestId("coach-config-step-indicator")).toHaveTextContent(
    label
  )
}

describe("CoachChallengeConfigCard interactive 3-step wizard", () => {
  beforeEach(() => {
    mockChatState = { messages: [], status: "ready", error: undefined }
    mockConnectionState = createConnectionState()
    mockPatternsState = defaultPatterns()
    mockCustomChallengesState = defaultCustomChallenges()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("never locks fields when LLM passes language/difficulty/topic, lets user choose TypeScript -> Hard -> Custom topic", async () => {
    const user = userEvent.setup()
    mockGenerateCustomChallenge.mockResolvedValue({
      slug: "ts-custom-race",
      title: "TypeScript Event Loop Starvation",
    })
    setConfigPart({
      toolCallId: "cfg-regression",
      state: "input-available",
      input: {
        prompt: "Build your custom challenge",
        language: "python",
        difficulty: "Easy",
        topic: "IDOR in Python Flask",
      },
    })

    render(<CoachWorkspace />)

    expectStep("Step 1 of 3")
    expect(
      screen.getByTestId("coach-config-language-group")
    ).toBeInTheDocument()
    for (const label of ["Python", "TypeScript", "Go", "Rust", "Java", "C#"]) {
      expect(screen.getByRole("radio", { name: label })).toBeInTheDocument()
    }

    await user.click(screen.getByRole("radio", { name: "TypeScript" }))
    expectStep("Step 2 of 3")
    expect(
      screen.getByTestId("coach-config-difficulty-group")
    ).toBeInTheDocument()

    await user.click(screen.getByRole("radio", { name: "Hard" }))
    expectStep("Step 3 of 3")
    expect(screen.getByTestId("coach-config-topic-group")).toBeInTheDocument()

    await user.click(screen.getByTestId("coach-config-topic-custom-toggle"))
    const customInput = screen.getByTestId("coach-config-custom-topic-input")
    expect(screen.getByTestId("coach-config-continue-button")).toBeDisabled()

    await user.type(customInput, "Event loop starvation in Node worker")
    await user.click(screen.getByTestId("coach-config-continue-button"))

    await waitFor(() => {
      expect(mockGenerateCustomChallenge).toHaveBeenCalledWith({
        language: "typescript",
        difficulty: "Hard",
        topic: "Event loop starvation in Node worker",
      })
    })
    expect(mockAddToolOutput).toHaveBeenCalledWith({
      tool: COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
      toolCallId: "cfg-regression",
      output: {
        status: "created",
        slug: "ts-custom-race",
        title: "TypeScript Event Loop Starvation",
        language: "typescript",
        difficulty: "Hard",
        topic: "Event loop starvation in Node worker",
      },
    })
  })

  it("swaps to language-matched default topics when user picks a different language than LLM recommended", async () => {
    const user = userEvent.setup()
    setConfigPart({
      toolCallId: "cfg-lang-swap",
      state: "input-available",
      input: {
        language: "python",
        suggestedTopics: [
          {
            label: "Flask IDOR",
            topic: "IDOR in Python Flask route",
            rationale: "Targets Python auth blind spots.",
          },
        ],
      },
    })

    render(<CoachWorkspace />)

    await user.click(screen.getByRole("radio", { name: "C#" }))
    await user.click(screen.getByRole("radio", { name: "Medium" }))

    expect(screen.queryByText("Flask IDOR")).not.toBeInTheDocument()
    const csharpDefaultLabel = getDefaultTopicsForLanguage("csharp")[0].label
    expect(
      screen.getByRole("radio", { name: csharpDefaultLabel })
    ).toBeInTheDocument()
  })

  it("supports Back button, Next button, and clicking header step chips to revise earlier selections", async () => {
    const user = userEvent.setup()
    mockGenerateCustomChallenge.mockResolvedValue({
      slug: "rust-lock",
      title: "Rust Lock Across Await",
    })
    setConfigPart({
      toolCallId: "cfg-nav",
      state: "input-available",
      input: {
        suggestedTopics: [
          {
            label: "Async race",
            topic: "Concurrent read-modify-write race condition",
            rationale: "Targets low recall in async code.",
          },
        ],
      },
    })

    render(<CoachWorkspace />)

    await user.click(screen.getByRole("radio", { name: "Python" }))
    await user.click(screen.getByRole("radio", { name: "Easy" }))
    expectStep("Step 3 of 3")

    await user.click(screen.getByTestId("coach-config-back-button"))
    expectStep("Step 2 of 3")
    expect(screen.getByTestId("coach-config-next-button")).toBeInTheDocument()

    await user.click(screen.getByTestId("coach-config-step-language"))
    expectStep("Step 1 of 3")
    expect(screen.getByTestId("coach-config-next-button")).toBeInTheDocument()

    await user.click(screen.getByRole("radio", { name: "Rust" }))
    await user.click(screen.getByRole("radio", { name: "Hard" }))
    await user.click(screen.getByTestId("coach-config-continue-button"))

    await waitFor(() => {
      expect(mockGenerateCustomChallenge).toHaveBeenCalledWith({
        language: "rust",
        difficulty: "Hard",
        topic: "Concurrent read-modify-write race condition",
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

    setConfigPart({
      toolCallId: "cfg-retry",
      state: "input-available",
      input: {
        suggestedTopics: [{ label: "JWT bypass", topic: "JWT bypass flaw" }],
      },
    })

    const { rerender } = render(<CoachWorkspace />)

    await user.click(screen.getByRole("radio", { name: "Python" }))
    await user.click(screen.getByRole("radio", { name: "Medium" }))
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

    setConfigPart({
      toolCallId: "cfg-created",
      state: "output-available",
      input: {},
      output: {
        status: "created",
        slug: "py-jwt-retry",
        title: "FastAPI JWT Verification",
        language: "python",
        difficulty: "Medium",
        topic: "JWT bypass flaw",
      },
    })
    rerender(<CoachWorkspace />)
    const openLink = screen.getByTestId("coach-config-open-challenge")
    expect(openLink).toHaveAttribute("href", "/challenges/py-jwt-retry")
    expect(openLink).toHaveTextContent("Start Review in Arena")

    mockAddToolOutput.mockClear()
    mockCustomChallengesState = defaultCustomChallenges({
      total: 5,
      quotaRemaining: 0,
      isQuotaFull: true,
    })
    setConfigPart({
      toolCallId: "cfg-quota",
      state: "input-available",
      input: {},
    })
    rerender(<CoachWorkspace />)

    expect(screen.getByTestId("coach-config-quota-alert")).toHaveTextContent(
      "Library full (5/5)"
    )
    await user.click(screen.getByTestId("coach-config-quota-dismiss-button"))
    expect(mockAddToolOutput).toHaveBeenCalledWith({
      tool: COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
      toolCallId: "cfg-quota",
      output: { status: "quota_full", quotaLimit: 5 },
    })

    mockAddToolOutput.mockClear()
    mockCustomChallengesState = defaultCustomChallenges()
    setConfigPart({
      toolCallId: "cfg-cancel",
      state: "input-available",
      input: {},
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
    setConfigPart({
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
