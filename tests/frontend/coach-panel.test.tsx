import * as React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CoachPanel } from "@/components/coach/coach-panel"
import { CoachWorkspace } from "@/components/coach/coach-workspace"
import { PatternsCoachDrawer } from "@/components/coach/patterns-coach-drawer"
import {
  CREATE_CHALLENGE_PROMPT,
  PATTERNS_QUICK_PROMPTS,
} from "@/components/coach/use-coach-chat"
import { ComparisonView } from "@/components/review/comparison-view"
import type { CoachPatternsSnapshot, CoachUIMessage } from "@/lib/ai/coach"
import type { ChallengeSummary } from "@/types/challenge"
import {
  createConnectionState,
  SAMPLE_CUSTOM_CHALLENGE,
  SAMPLE_DRILL_MESSAGES,
  SAMPLE_PATTERNS,
} from "./coach-test-fixtures"

const mockPush = vi.fn()
const mockReplace = vi.fn()
const mockSendMessage = vi.fn()
const mockAddToolOutput = vi.fn()
const mockStop = vi.fn()
const mockSetMessages = vi.fn()
const mockClearError = vi.fn()
const mockGenerateCustomChallenge = vi.fn()
const mockDeleteCustomChallenge = vi.fn()

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

describe("Agent Coach UI components", () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams()
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
    mockChatState = { messages: [], status: "ready", error: undefined }
    mockConnectionState = createConnectionState()
    mockPatternsState = {
      patterns: SAMPLE_PATTERNS,
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
      "Anthropic (claude-sonnet-5-5)"
    )

    const chip = screen.getByTestId("coach-quick-prompt-blind-spots")
    await user.click(chip)

    expect(mockSendMessage).toHaveBeenCalledWith({
      text: PATTERNS_QUICK_PROMPTS[0].prompt,
    })
  })

  it("renders reasoning block, text prose, and suggest_targeted_drill handoff in CoachWorkspace", async () => {
    const user = userEvent.setup()

    mockChatState = {
      status: "ready",
      error: undefined,
      messages: SAMPLE_DRILL_MESSAGES,
    }

    render(<CoachWorkspace />)

    const reasoningToggle = screen.getByTestId("coach-reasoning-toggle")
    expect(reasoningToggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByTestId("coach-reasoning-content")).not.toBeVisible()
    expect(
      screen.queryByText("Checking recall drop on Rust concurrency challenges.")
    ).not.toBeInTheDocument()

    await user.click(reasoningToggle)
    expect(reasoningToggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByTestId("coach-reasoning-content")).toBeVisible()
    expect(screen.getByTestId("coach-reasoning-content")).toHaveTextContent(
      "Checking recall drop on Rust concurrency challenges."
    )

    expect(
      screen.getByText("Focus on lock ordering in concurrent Rust services.")
    ).toBeInTheDocument()
    expect(
      screen.getByTestId("coach-drill-suggestion-card")
    ).toBeInTheDocument()

    mockGenerateCustomChallenge.mockResolvedValue({
      slug: "rust-async-lock-drill",
      title: "Async Lock Ordering Across Await",
    })

    await user.click(screen.getByTestId("coach-generate-drill-button"))

    expect(mockGenerateCustomChallenge).toHaveBeenCalledWith({
      topic: "Async lock ordering across await points",
      language: "rust",
      difficulty: "Hard",
    })

    const openLink = await screen.findByTestId("coach-drill-open-challenge")
    expect(openLink).toHaveTextContent("Start Review in Arena")
    expect(openLink).toHaveAttribute(
      "href",
      "/challenges/rust-async-lock-drill"
    )
  })

  it("auto-sends ?prompt= in CoachWorkspace and cleans the URL", () => {
    mockSearchParams = new URLSearchParams("prompt=Analyze+my+blind+spots")
    const replaceStateSpy = vi.spyOn(window.history, "replaceState")

    render(<CoachWorkspace />)

    expect(mockSendMessage).toHaveBeenCalledWith({
      text: "Analyze my blind spots",
    })
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

  it("routes top bar, sidebar rail, and composer menu triggers to in-chat challenge creation and deletes custom challenges", async () => {
    const user = userEvent.setup()
    mockDeleteCustomChallenge.mockResolvedValue({ deleted: true })

    render(<CoachWorkspace />)

    expect(screen.getByTestId("coach-rail-quota-badge")).toHaveTextContent(
      "2/5"
    )

    await user.click(screen.getByTestId("coach-top-generate-button"))
    expect(mockSendMessage).toHaveBeenCalledWith({
      text: CREATE_CHALLENGE_PROMPT,
    })

    await user.click(screen.getByTestId("coach-rail-new-challenge-button"))
    expect(mockSendMessage).toHaveBeenCalledTimes(2)

    await user.click(screen.getByTestId("coach-actions-menu-trigger"))
    await user.click(screen.getByTestId("coach-menu-generate-challenge"))
    expect(mockSendMessage).toHaveBeenCalledTimes(3)

    await user.click(screen.getByTestId("coach-rail-delete-custom-jwt-bypass"))
    expect(mockDeleteCustomChallenge).toHaveBeenCalledWith("custom-jwt-bypass")
  })
})
