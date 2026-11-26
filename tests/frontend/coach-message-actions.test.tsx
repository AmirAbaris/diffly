import * as React from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AxiosError, AxiosHeaders } from "axios"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CoachPanel } from "@/components/coach/coach-panel"
import { CoachWorkspace } from "@/components/coach/coach-workspace"
import { PATTERNS_QUICK_PROMPTS } from "@/components/coach/use-coach-chat"
import type { CoachUIMessage } from "@/lib/ai/coach"
import {
  createConnectionState,
  SAMPLE_COACH_THREADS,
  SAMPLE_CUSTOM_CHALLENGE,
  SAMPLE_PATTERNS,
} from "./coach-test-fixtures"

const mockSendMessage = vi.fn()
const mockRegenerate = vi.fn()
const mockAddToolOutput = vi.fn()
const mockStop = vi.fn()
const mockSetMessages = vi.fn()
const mockClearError = vi.fn()
const mockFetchThread = vi.fn()
const mockTruncateMessages = vi.fn()
const mockRevalidateThreads = vi.fn()

let mockSearchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
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
    regenerate: mockRegenerate,
    addToolOutput: mockAddToolOutput,
    stop: mockStop,
    setMessages: mockSetMessages,
    clearError: mockClearError,
  }),
}))

vi.mock("@/hooks/use-ai-connection", () => ({
  useAIConnection: () => createConnectionState(),
}))

vi.mock("@/hooks/use-coach-patterns", () => ({
  useCoachPatterns: () => ({
    patterns: SAMPLE_PATTERNS,
    isLoading: false,
    error: null,
    mutate: vi.fn(),
  }),
}))

vi.mock("@/hooks/use-custom-challenges", () => ({
  useCustomChallenges: () => ({
    customChallenges: [SAMPLE_CUSTOM_CHALLENGE],
    total: 1,
    quotaLimit: 5,
    quotaRemaining: 4,
    isQuotaFull: false,
    isLoading: false,
    generateCustomChallenge: vi.fn(),
    deleteCustomChallenge: vi.fn(),
  }),
  isRequestTimeoutError: () => false,
}))

vi.mock("@/hooks/use-coach-threads", () => ({
  useCoachThreads: () => ({
    items: SAMPLE_COACH_THREADS,
    total: SAMPLE_COACH_THREADS.length,
    isLoading: false,
    error: null,
    fetchThread: mockFetchThread,
    truncateMessages: mockTruncateMessages,
    renameThread: vi.fn(),
    deleteThread: vi.fn(),
    revalidate: mockRevalidateThreads,
  }),
  COACH_THREADS_SWR_KEY: "/api/user/coach-threads?limit=50",
  isCoachThreadsKey: () => false,
}))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: 42, username: "reviewer", email: "rev@example.com" },
    isAuthenticated: true,
    isLoading: false,
  }),
}))

const [THREAD_1] = SAMPLE_COACH_THREADS

const FOUR_TURN_MESSAGES: CoachUIMessage[] = [
  {
    id: "u-0",
    role: "user",
    parts: [{ type: "text", text: "First question" }],
  },
  {
    id: "a-1",
    role: "assistant",
    parts: [{ type: "text", text: "First reply" }],
  },
  {
    id: "u-2",
    role: "user",
    parts: [{ type: "text", text: "Second question" }],
  },
  {
    id: "a-3",
    role: "assistant",
    parts: [{ type: "text", text: "Second reply" }],
  },
]

function createAxiosStatusError(status: number): AxiosError {
  return new AxiosError(
    `Request failed with status ${status}`,
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    {
      status,
      statusText: "Error",
      data: { detail: "error" },
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
    }
  )
}

describe("Coach regenerate and edit-and-resend actions", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/coach")
    mockSearchParams = new URLSearchParams()
    mockChatState = {
      messages: FOUR_TURN_MESSAGES,
      status: "ready",
      error: undefined,
    }
    mockSetMessages.mockImplementation((next: CoachUIMessage[]) => {
      mockChatState = { ...mockChatState, messages: next }
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("shows Regenerate only on latest assistant message in CoachPanel and triggers regenerate", async () => {
    const user = userEvent.setup()

    render(
      <CoachPanel
        target={{ mode: "patterns" }}
        quickPrompts={PATTERNS_QUICK_PROMPTS}
      />
    )

    const regenButtons = screen.getAllByTestId(
      "coach-regenerate-message-button"
    )
    expect(regenButtons).toHaveLength(1)

    await user.click(regenButtons[0])
    expect(mockRegenerate).toHaveBeenCalledWith({ messageId: "a-3" })
    expect(mockTruncateMessages).not.toHaveBeenCalled()
  })

  it("truncates from last assistant sequence before regenerating in persisted thread and rolls back on failure", async () => {
    const user = userEvent.setup()
    mockSearchParams = new URLSearchParams(`thread=${THREAD_1.id}`)
    mockFetchThread.mockResolvedValue({
      thread: { ...THREAD_1, messages: [] },
      messages: FOUR_TURN_MESSAGES,
      sequenceByMessageId: { "u-0": 0, "a-1": 1, "u-2": 2, "a-3": 3 },
    })
    mockTruncateMessages.mockResolvedValueOnce({
      deleted_count: 1,
      remaining_count: 3,
    })

    const { rerender } = render(<CoachWorkspace />)
    await waitFor(() => {
      expect(mockFetchThread).toHaveBeenCalledWith(
        THREAD_1.id,
        expect.any(Object)
      )
    })

    mockChatState = {
      messages: FOUR_TURN_MESSAGES,
      status: "ready",
      error: undefined,
    }
    rerender(<CoachWorkspace />)

    await user.click(screen.getByTestId("coach-regenerate-message-button"))

    await waitFor(() => {
      expect(mockTruncateMessages).toHaveBeenCalledWith(THREAD_1.id, 3)
      expect(mockRegenerate).toHaveBeenCalledWith({ messageId: "a-3" })
    })

    mockRegenerate.mockClear()
    mockTruncateMessages.mockRejectedValueOnce(createAxiosStatusError(500))

    await user.click(screen.getByTestId("coach-regenerate-message-button"))

    expect(await screen.findByTestId("coach-error-banner")).toHaveTextContent(
      "Could not update conversation history"
    )
    expect(mockRegenerate).not.toHaveBeenCalled()
  })

  it("opens inline editor, cancels cleanly, and truncates + resends on Save & Send", async () => {
    const user = userEvent.setup()
    mockSearchParams = new URLSearchParams(`thread=${THREAD_1.id}`)
    mockFetchThread.mockResolvedValue({
      thread: { ...THREAD_1, messages: [] },
      messages: FOUR_TURN_MESSAGES,
      sequenceByMessageId: { "u-0": 0, "a-1": 1, "u-2": 2, "a-3": 3 },
    })
    mockTruncateMessages.mockResolvedValueOnce({
      deleted_count: 2,
      remaining_count: 2,
    })

    const { rerender } = render(<CoachWorkspace />)
    await waitFor(() => {
      expect(mockFetchThread).toHaveBeenCalled()
    })

    mockChatState = {
      messages: FOUR_TURN_MESSAGES,
      status: "ready",
      error: undefined,
    }
    rerender(<CoachWorkspace />)

    const editButtons = screen.getAllByTestId("coach-edit-message-button")
    expect(editButtons).toHaveLength(2)

    await user.click(editButtons[1])
    const input = screen.getByTestId("coach-edit-message-input")
    expect(input).toHaveValue("Second question")

    await user.click(screen.getByTestId("coach-edit-cancel-button"))
    expect(
      screen.queryByTestId("coach-edit-message-input")
    ).not.toBeInTheDocument()

    await user.click(screen.getAllByTestId("coach-edit-message-button")[1])
    const editInput = screen.getByTestId("coach-edit-message-input")
    await user.clear(editInput)
    await user.type(editInput, "Updated second question")
    await user.click(screen.getByTestId("coach-edit-save-button"))

    await waitFor(() => {
      expect(mockTruncateMessages).toHaveBeenCalledWith(THREAD_1.id, 2)
      expect(mockSetMessages).toHaveBeenCalledWith(
        FOUR_TURN_MESSAGES.slice(0, 2)
      )
      expect(mockSendMessage).toHaveBeenCalledWith({
        text: "Updated second question",
      })
    })
  })

  it("keeps inline editor open with draft and error when truncate fails on edit-and-resend", async () => {
    const user = userEvent.setup()
    mockSearchParams = new URLSearchParams(`thread=${THREAD_1.id}`)
    mockFetchThread.mockResolvedValue({
      thread: { ...THREAD_1, messages: [] },
      messages: FOUR_TURN_MESSAGES,
      sequenceByMessageId: { "u-0": 0, "a-1": 1, "u-2": 2, "a-3": 3 },
    })
    mockTruncateMessages.mockRejectedValueOnce(createAxiosStatusError(500))

    const { rerender } = render(<CoachWorkspace />)
    await waitFor(() => {
      expect(mockFetchThread).toHaveBeenCalled()
    })

    mockChatState = {
      messages: FOUR_TURN_MESSAGES,
      status: "ready",
      error: undefined,
    }
    mockSetMessages.mockClear()
    rerender(<CoachWorkspace />)

    await user.click(screen.getAllByTestId("coach-edit-message-button")[0])
    const editInput = screen.getByTestId("coach-edit-message-input")
    await user.clear(editInput)
    await user.type(editInput, "Edited first question")
    await user.click(screen.getByTestId("coach-edit-save-button"))

    expect(await screen.findByTestId("coach-edit-error")).toHaveTextContent(
      "Could not update conversation history"
    )
    expect(screen.getByTestId("coach-edit-message-input")).toHaveValue(
      "Edited first question"
    )
    expect(mockSetMessages).not.toHaveBeenCalled()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })
})
