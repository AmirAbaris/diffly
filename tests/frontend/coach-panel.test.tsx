import * as React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CoachPanel } from "@/components/coach/coach-panel"
import { PatternsCoachDrawer } from "@/components/coach/patterns-coach-drawer"
import { PATTERNS_QUICK_PROMPTS } from "@/components/coach/use-coach-chat"
import { ComparisonView } from "@/components/review/comparison-view"
import type { AIProviderId } from "@/lib/ai/catalog"
import type { CoachUIMessage } from "@/lib/ai/coach"
import { useCustomChallengeModalStore } from "@/stores/custom-challenge-modal-store"

const mockPush = vi.fn()
const mockSendMessage = vi.fn()
const mockStop = vi.fn()
const mockSetMessages = vi.fn()
const mockClearError = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/stats",
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
    stop: mockStop,
    setMessages: mockSetMessages,
    clearError: mockClearError,
  }),
}))

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

describe("Agent Coach UI components", () => {
  beforeEach(() => {
    useCustomChallengeModalStore.setState({
      isOpen: false,
      initialTab: "generate",
      prefill: null,
      prefillNonce: 0,
    })

    mockChatState = {
      messages: [],
      status: "ready",
      error: undefined,
    }

    mockConnectionState = {
      isConnected: true,
      provider: "anthropic",
      model: "claude-sonnet-5-5",
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

  it("renders disconnected state with /settings link when AI provider is not connected", () => {
    mockConnectionState = {
      ...mockConnectionState,
      isConnected: false,
      provider: null,
      model: null,
      maskedKey: null,
    }

    render(
      <CoachPanel
        target={{ mode: "patterns" }}
        quickPrompts={PATTERNS_QUICK_PROMPTS}
        onGenerateDrill={vi.fn()}
      />
    )

    expect(screen.getByTestId("coach-disconnected-state")).toBeInTheDocument()
    const settingsLink = screen.getByTestId("coach-settings-link")
    expect(settingsLink).toHaveAttribute("href", "/settings")
  })

  it("renders connected quick-prompt chips and calls sendMessage on click", async () => {
    const user = userEvent.setup()

    render(
      <CoachPanel
        target={{ mode: "patterns" }}
        quickPrompts={PATTERNS_QUICK_PROMPTS}
        onGenerateDrill={vi.fn()}
      />
    )

    expect(screen.getByTestId("coach-connected-badge")).toHaveTextContent(
      "Connected: Anthropic (claude-sonnet-5-5)"
    )

    const chip = screen.getByTestId("coach-quick-prompt-blind-spots")
    await user.click(chip)

    expect(mockSendMessage).toHaveBeenCalledWith(
      { text: PATTERNS_QUICK_PROMPTS[0].prompt },
      { body: { mode: "patterns", sliceLimit: 5, missedLimit: 10 } }
    )
  })

  it("renders suggest_targeted_drill card and hands off prefill to custom challenge modal store", async () => {
    const user = userEvent.setup()
    const onOpeningTargetedDrill = vi.fn()

    mockChatState = {
      status: "ready",
      error: undefined,
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          parts: [
            {
              type: "text",
              text: "Focus on lock ordering in concurrent Rust services.",
            },
            {
              type: "tool-suggest_targeted_drill",
              toolCallId: "call-1",
              state: "output-available",
              input: {
                topic: "Async lock ordering across await points",
                language: "rust",
                difficulty: "Hard",
                rationale: "Addresses low recall on concurrency challenges.",
              },
              output: {
                topic: "Async lock ordering across await points",
                language: "rust",
                difficulty: "Hard",
                rationale: "Addresses low recall on concurrency challenges.",
              },
            },
          ],
        },
      ],
    }

    render(
      <PatternsCoachDrawer onOpeningTargetedDrill={onOpeningTargetedDrill} />
    )

    await user.click(screen.getByTestId("patterns-coach-toggle"))

    expect(
      screen.getByTestId("coach-drill-suggestion-card")
    ).toBeInTheDocument()
    expect(
      screen.getByText("Async lock ordering across await points")
    ).toBeInTheDocument()

    await user.click(screen.getByTestId("coach-generate-drill-button"))

    expect(onOpeningTargetedDrill).toHaveBeenCalledTimes(1)
    const store = useCustomChallengeModalStore.getState()
    expect(store.isOpen).toBe(true)
    expect(store.initialTab).toBe("generate")
    expect(store.prefill).toEqual({
      topic: "Async lock ordering across await points",
      language: "rust",
      difficulty: "Hard",
    })
  })

  it("renders DebriefCoachDrawer inside ComparisonView and expands on toggle", async () => {
    const user = userEvent.setup()

    render(
      <ComparisonView
        challengeSlug="async-race-condition"
        challengeTitle="Async Race Condition"
        language="python"
        userFlaggedLines={[12]}
        userComments="Possible race condition on shared dict"
        canonicalSolution={{
          id: 1,
          challenge_id: 1,
          slug: "async-race-condition",
          canonical_review: "Use an asyncio.Lock around mutations.",
          recommended_fix_diff:
            "- state[k] = v\n+ async with lock:\n+   state[k] = v",
          expected_issues: [],
        }}
      />
    )

    const toggle = screen.getByTestId("debrief-coach-toggle")
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByTestId("coach-panel")).not.toBeInTheDocument()

    await user.click(toggle)

    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByTestId("coach-panel")).toBeInTheDocument()
    expect(
      screen.getByTestId("coach-quick-prompt-missed-defects")
    ).toBeInTheDocument()
  })
})
