import * as React from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CoachPanel } from "@/components/coach/coach-panel"
import { CoachWorkspace } from "@/components/coach/coach-workspace"
import { PATTERNS_QUICK_PROMPTS } from "@/components/coach/use-coach-chat"
import type { CoachUIMessage } from "@/lib/ai/coach"
import type { CoachThreadSummary } from "@/types/coach-thread"
import {
  createConnectionState,
  SAMPLE_COACH_THREADS,
  SAMPLE_CUSTOM_CHALLENGE,
  SAMPLE_DRILL_MESSAGES,
  SAMPLE_HYDRATED_TOOL_MESSAGES,
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
const mockRenameThread = vi.fn()
const mockDeleteThread = vi.fn()
const mockRevalidateThreads = vi.fn()

let mockSearchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/coach",
}))

let capturedUseChatOptions: {
  id?: string
  transport?: { fetch?: typeof globalThis.fetch }
  onFinish?: (event: { isAbort: boolean; isError: boolean }) => void
} | null = null

let mockChatState: {
  messages: CoachUIMessage[]
  status: "ready" | "submitted" | "streaming" | "error"
  error: Error | undefined
}

vi.mock("@ai-sdk/react", () => ({
  useChat: (options: typeof capturedUseChatOptions) => {
    capturedUseChatOptions = options
    return {
      id: options?.id ?? "test-chat",
      messages: mockChatState.messages,
      status: mockChatState.status,
      error: mockChatState.error,
      sendMessage: mockSendMessage,
      regenerate: mockRegenerate,
      addToolOutput: mockAddToolOutput,
      stop: mockStop,
      setMessages: mockSetMessages,
      clearError: mockClearError,
    }
  },
}))

let mockConnectionState = createConnectionState()

vi.mock("@/hooks/use-ai-connection", () => ({
  useAIConnection: () => mockConnectionState,
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

let mockThreads: CoachThreadSummary[] = SAMPLE_COACH_THREADS

vi.mock("@/hooks/use-coach-threads", () => ({
  useCoachThreads: () => ({
    items: mockThreads,
    total: mockThreads.length,
    isLoading: false,
    error: null,
    fetchThread: mockFetchThread,
    truncateMessages: mockTruncateMessages,
    renameThread: mockRenameThread,
    deleteThread: mockDeleteThread,
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

describe("Multi-thread Coach workspace", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/coach")
    mockSearchParams = new URLSearchParams()
    capturedUseChatOptions = null
    mockChatState = { messages: [], status: "ready", error: undefined }
    mockConnectionState = createConnectionState()
    mockThreads = SAMPLE_COACH_THREADS
    mockSetMessages.mockImplementation((next: CoachUIMessage[]) => {
      mockChatState = { ...mockChatState, messages: next }
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("renders saved threads, switches while streaming, hydrates tool cards, and updates URL", async () => {
    const user = userEvent.setup()
    const pushStateSpy = vi.spyOn(window.history, "pushState")

    mockChatState = { messages: [], status: "streaming", error: undefined }
    mockFetchThread.mockResolvedValue({
      thread: { ...THREAD_1, messages: [] },
      messages: SAMPLE_HYDRATED_TOOL_MESSAGES,
    })

    const { rerender } = render(<CoachWorkspace />)

    expect(screen.getByTestId("coach-rail-threads-count")).toHaveTextContent(
      "2"
    )
    await user.click(screen.getByTestId(`coach-thread-select-${THREAD_1.id}`))

    expect(mockStop).toHaveBeenCalled()
    expect(pushStateSpy).toHaveBeenCalledWith(
      window.history.state,
      "",
      `/coach?thread=${encodeURIComponent(THREAD_1.id)}`
    )
    await waitFor(() => {
      expect(mockSetMessages).toHaveBeenCalledWith(
        SAMPLE_HYDRATED_TOOL_MESSAGES
      )
    })

    mockChatState = {
      messages: SAMPLE_HYDRATED_TOOL_MESSAGES,
      status: "ready",
      error: undefined,
    }
    rerender(<CoachWorkspace />)

    expect(
      screen.getByTestId(`coach-thread-item-${THREAD_1.id}`)
    ).toHaveAttribute("data-active", "true")
    expect(
      screen.getByTestId("coach-drill-suggestion-card")
    ).toBeInTheDocument()
    expect(screen.getByTestId("coach-debrief-complete")).toBeInTheDocument()
    expect(screen.getByTestId("coach-config-created")).toBeInTheDocument()

    pushStateSpy.mockRestore()
  })

  it("updates URL lazily from X-Coach-Thread-Id header and shows persistence notice on degradation", async () => {
    const replaceStateSpy = vi.spyOn(window.history, "replaceState")
    const originalFetch = globalThis.fetch
    const mockFetch = vi.fn()
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch

    try {
      render(<CoachWorkspace />)
      const transportFetch = capturedUseChatOptions?.transport?.fetch
      expect(transportFetch).toBeTypeOf("function")

      mockFetch.mockResolvedValueOnce(
        new Response("", {
          status: 200,
          headers: { "X-Coach-Thread-Id": THREAD_1.id },
        })
      )
      await transportFetch!("/api/coach", { method: "POST" })

      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenCalledWith(
          window.history.state,
          "",
          `/coach?thread=${encodeURIComponent(THREAD_1.id)}`
        )
      })
      expect(mockStop).not.toHaveBeenCalled()

      mockFetch.mockResolvedValueOnce(
        new Response("", {
          status: 200,
          headers: { "X-Coach-Persistence": "quota-exceeded" },
        })
      )
      await transportFetch!("/api/coach", { method: "POST" })

      expect(
        await screen.findByTestId("coach-persistence-notice")
      ).toHaveTextContent("Saved conversation limit reached")
    } finally {
      globalThis.fetch = originalFetch
      replaceStateSpy.mockRestore()
    }
  })

  it("starts a clean draft via New Chat button and composer menu while CoachPanel keeps Reset Conversation", async () => {
    const user = userEvent.setup()
    const replaceStateSpy = vi.spyOn(window.history, "replaceState")

    const { unmount } = render(<CoachWorkspace />)

    await user.click(screen.getByTestId("coach-top-new-chat-button"))
    expect(mockSetMessages).toHaveBeenCalledWith([])
    expect(mockDeleteThread).not.toHaveBeenCalled()
    expect(replaceStateSpy).toHaveBeenCalledWith(
      window.history.state,
      "",
      "/coach"
    )

    await user.click(screen.getByTestId("coach-actions-menu-trigger"))
    const newChatMenuItem = screen.getByTestId("coach-menu-new-chat")
    expect(newChatMenuItem).toHaveTextContent("New Chat")
    await user.click(newChatMenuItem)
    expect(mockSetMessages).toHaveBeenCalledTimes(2)

    unmount()

    mockChatState = {
      messages: SAMPLE_DRILL_MESSAGES,
      status: "ready",
      error: undefined,
    }
    render(
      <CoachPanel
        target={{ mode: "patterns" }}
        quickPrompts={PATTERNS_QUICK_PROMPTS}
      />
    )
    await user.click(screen.getByTestId("coach-actions-menu-trigger"))
    expect(screen.getByTestId("coach-reset-button")).toHaveTextContent(
      "Reset Conversation"
    )

    replaceStateSpy.mockRestore()
  })

  it("supports inline rename with Enter to save and Escape to cancel", async () => {
    const user = userEvent.setup()
    mockRenameThread.mockResolvedValue({
      ...THREAD_1,
      title: "Updated Rust locks",
    })

    render(<CoachWorkspace />)

    await user.click(screen.getByTestId(`coach-thread-rename-${THREAD_1.id}`))
    const input = screen.getByTestId(`coach-thread-rename-input-${THREAD_1.id}`)
    await user.clear(input)
    await user.type(input, "Temporary title{Escape}")

    expect(
      screen.queryByTestId(`coach-thread-rename-input-${THREAD_1.id}`)
    ).not.toBeInTheDocument()
    expect(mockRenameThread).not.toHaveBeenCalled()

    await user.click(screen.getByTestId(`coach-thread-rename-${THREAD_1.id}`))
    const retryInput = screen.getByTestId(
      `coach-thread-rename-input-${THREAD_1.id}`
    )
    await user.clear(retryInput)
    await user.type(retryInput, "Updated Rust locks{Enter}")

    await waitFor(() => {
      expect(mockRenameThread).toHaveBeenCalledWith(
        THREAD_1.id,
        "Updated Rust locks"
      )
    })
  })

  it("confirms deletion in a dialog and resets to fresh draft when deleting the active thread", async () => {
    const user = userEvent.setup()
    const replaceStateSpy = vi.spyOn(window.history, "replaceState")
    mockFetchThread.mockResolvedValue({
      thread: { ...THREAD_1, messages: [] },
      messages: SAMPLE_HYDRATED_TOOL_MESSAGES,
    })
    mockDeleteThread.mockResolvedValue(undefined)

    render(<CoachWorkspace />)

    await user.click(screen.getByTestId(`coach-thread-select-${THREAD_1.id}`))
    await waitFor(() => {
      expect(mockFetchThread).toHaveBeenCalledWith(
        THREAD_1.id,
        expect.any(Object)
      )
    })

    await user.click(screen.getByTestId(`coach-thread-delete-${THREAD_1.id}`))
    expect(screen.getByText("Delete conversation?")).toBeInTheDocument()
    await user.click(screen.getByTestId("coach-thread-delete-confirm"))

    await waitFor(() => {
      expect(mockDeleteThread).toHaveBeenCalledWith(THREAD_1.id)
    })
    expect(replaceStateSpy).toHaveBeenCalledWith(
      window.history.state,
      "",
      "/coach"
    )
    replaceStateSpy.mockRestore()
  })

  it("opens the mobile drawer with Chats and Context tabs", async () => {
    const user = userEvent.setup()

    render(<CoachWorkspace />)

    await user.click(screen.getByTestId("coach-mobile-rail-trigger"))

    const drawer = screen.getByTestId("coach-mobile-drawer")
    expect(drawer).toBeInTheDocument()
    expect(drawer).toHaveTextContent("Coach Workspace")
    expect(drawer).toHaveTextContent("Chats")
    expect(drawer).toHaveTextContent("Context")
  })

  it("opens a fresh thread and auto-sends on ?prompt= deep link", () => {
    mockSearchParams = new URLSearchParams("prompt=Check+my+SQL+blind+spots")
    const replaceStateSpy = vi.spyOn(window.history, "replaceState")

    render(<CoachWorkspace />)

    expect(mockSendMessage).toHaveBeenCalledWith({
      text: "Check my SQL blind spots",
    })
    expect(replaceStateSpy).toHaveBeenCalledWith(
      window.history.state,
      "",
      "/coach"
    )
    replaceStateSpy.mockRestore()
  })
})
