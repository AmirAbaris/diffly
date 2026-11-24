import * as React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CoachPanel } from "@/components/coach/coach-panel"
import { CoachWorkspace } from "@/components/coach/coach-workspace"
import { PatternsCoachDrawer } from "@/components/coach/patterns-coach-drawer"
import { PATTERNS_QUICK_PROMPTS } from "@/components/coach/use-coach-chat"
import { ComparisonView } from "@/components/review/comparison-view"
import type { AIProviderId } from "@/lib/ai/catalog"
import type { CoachPatternsSnapshot, CoachUIMessage } from "@/lib/ai/coach"
import { useCustomChallengeModalStore } from "@/stores/custom-challenge-modal-store"

const mockPush = vi.fn()
const mockReplace = vi.fn()
const mockSendMessage = vi.fn()
const mockStop = vi.fn()
const mockSetMessages = vi.fn()
const mockClearError = vi.fn()

let mockSearchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
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

let mockPatternsState: {
  patterns: CoachPatternsSnapshot | null
  isLoading: boolean
  error: Error | null
  mutate: ReturnType<typeof vi.fn>
}

vi.mock("@/hooks/use-coach-patterns", () => ({
  useCoachPatterns: () => mockPatternsState,
}))

describe("Agent Coach UI components", () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams()
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

    mockPatternsState = {
      patterns: {
        total_submissions: 8,
        total_missed_submissions: 3,
        weakest_slices: [
          {
            category: "Concurrency",
            language: "rust",
            difficulty: "Hard",
            attempts: 3,
            unique_challenges: 2,
            average_score: 58,
            precision: 70,
            recall: 48,
            concept_coverage: 55,
            dominant_failure_mode: "low_recall",
          },
        ],
        strongest_slices: [],
        recent_missed: [
          {
            challenge_slug: "async-lock-order",
            title: "Async Lock Ordering",
            category: "Concurrency",
            language: "rust",
            difficulty: "Hard",
            score: 52,
            missed_line_count: 2,
            false_positive_count: 1,
            submitted_at: "2026-11-22T10:00:00Z",
          },
        ],
      },
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    }
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("renders disconnected state with /settings link in CoachPanel and CoachWorkspace", () => {
    mockConnectionState = {
      ...mockConnectionState,
      isConnected: false,
      provider: null,
      model: null,
      maskedKey: null,
    }

    const { unmount } = render(
      <CoachPanel
        target={{ mode: "patterns" }}
        quickPrompts={PATTERNS_QUICK_PROMPTS}
        onGenerateDrill={vi.fn()}
      />
    )

    expect(screen.getByTestId("coach-disconnected-state")).toBeInTheDocument()
    expect(screen.getByTestId("coach-settings-link")).toHaveAttribute(
      "href",
      "/settings"
    )

    unmount()

    render(<CoachWorkspace />)
    expect(screen.getByTestId("coach-disconnected-state")).toBeInTheDocument()
    expect(screen.getByTestId("coach-settings-link")).toHaveAttribute(
      "href",
      "/settings"
    )
  })

  it("renders connected quick-prompt cards and calls sendMessage on click", async () => {
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

  it("renders reasoning block, text prose, and suggest_targeted_drill handoff in CoachWorkspace", async () => {
    const user = userEvent.setup()

    mockChatState = {
      status: "ready",
      error: undefined,
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          parts: [
            {
              type: "reasoning",
              text: "Checking recall drop on Rust concurrency challenges.",
            },
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

    render(<CoachWorkspace />)

    const reasoningToggle = screen.getByTestId("coach-reasoning-toggle")
    expect(reasoningToggle).toHaveAttribute("aria-expanded", "false")
    expect(
      screen.queryByTestId("coach-reasoning-content")
    ).not.toBeInTheDocument()

    await user.click(reasoningToggle)
    expect(reasoningToggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByTestId("coach-reasoning-content")).toHaveTextContent(
      "Checking recall drop on Rust concurrency challenges."
    )

    expect(
      screen.getByText("Focus on lock ordering in concurrent Rust services.")
    ).toBeInTheDocument()
    expect(
      screen.getByTestId("coach-drill-suggestion-card")
    ).toBeInTheDocument()

    await user.click(screen.getByTestId("coach-generate-drill-button"))

    const store = useCustomChallengeModalStore.getState()
    expect(store.isOpen).toBe(true)
    expect(store.initialTab).toBe("generate")
    expect(store.prefill).toEqual({
      topic: "Async lock ordering across await points",
      language: "rust",
      difficulty: "Hard",
    })
  })

  it("auto-sends ?prompt= in CoachWorkspace and cleans the URL", () => {
    mockSearchParams = new URLSearchParams("prompt=Analyze+my+blind+spots")
    const replaceStateSpy = vi.spyOn(window.history, "replaceState")

    render(<CoachWorkspace />)

    expect(mockSendMessage).toHaveBeenCalledWith(
      { text: "Analyze my blind spots" },
      { body: { mode: "patterns", sliceLimit: 5, missedLimit: 10 } }
    )
    expect(replaceStateSpy).toHaveBeenCalledWith(
      window.history.state,
      "",
      "/coach"
    )
    replaceStateSpy.mockRestore()
  })

  it("renders PatternsCoachDrawer on /stats with direct links to /coach and /coach?prompt=...", () => {
    render(<PatternsCoachDrawer />)

    expect(screen.getByTestId("patterns-coach-drawer")).toBeInTheDocument()
    expect(screen.getByTestId("patterns-coach-open-link")).toHaveAttribute(
      "href",
      "/coach"
    )

    const blindSpotsLink = screen.getByTestId(
      "patterns-coach-prompt-blind-spots"
    )
    expect(blindSpotsLink).toHaveAttribute(
      "href",
      `/coach?prompt=${encodeURIComponent(PATTERNS_QUICK_PROMPTS[0].prompt)}`
    )
  })

  it("renders DebriefCoachDrawer inside ComparisonView, expands on toggle, and links to /coach", async () => {
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
    expect(screen.getByTestId("debrief-open-full-coach")).toHaveAttribute(
      "href",
      "/coach"
    )

    await user.click(toggle)

    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByTestId("coach-panel")).toBeInTheDocument()
    expect(
      screen.getByTestId("coach-quick-prompt-missed-defects")
    ).toBeInTheDocument()
  })
})
