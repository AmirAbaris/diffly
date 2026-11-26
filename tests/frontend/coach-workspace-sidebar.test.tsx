import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CoachWorkspace } from "@/components/coach/coach-workspace"
import type { CoachPatternsSnapshot, CoachUIMessage } from "@/lib/ai/coach"
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

describe("CoachWorkspace sidebar interactivity", () => {
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
      total: 1,
      quotaLimit: 5,
      quotaRemaining: 4,
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

  it("keeps sidebar pattern cards, missed reviews, and new-challenge button clickable when chat is in error state", async () => {
    const user = userEvent.setup()
    mockChatState = {
      messages: [],
      status: "error",
      error: new Error("Upstream rate limit"),
    }

    render(<CoachWorkspace />)

    expect(screen.getByTestId("coach-error-banner")).toBeInTheDocument()

    const rail = screen.getByTestId("coach-context-rail")
    const weakestButton = rail.querySelector("button")
    expect(weakestButton).not.toBeNull()
    expect(weakestButton).not.toBeDisabled()
    expect(
      screen.getByTestId("coach-rail-new-challenge-button")
    ).not.toBeDisabled()

    await user.click(weakestButton as HTMLButtonElement)
    expect(mockClearError).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
  })
})
