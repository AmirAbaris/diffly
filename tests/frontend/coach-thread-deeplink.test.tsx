import * as React from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CoachWorkspace } from "@/components/coach/coach-workspace"
import type { CoachUIMessage } from "@/lib/ai/coach"
import type { CoachThreadSummary } from "@/types/coach-thread"
import {
  createConnectionState,
  SAMPLE_COACH_THREADS,
  SAMPLE_CUSTOM_CHALLENGE,
  SAMPLE_HYDRATED_TOOL_MESSAGES,
  SAMPLE_PATTERNS,
} from "./coach-test-fixtures"

const mockSetMessages = vi.fn()
const mockFetchThread = vi.fn()
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
  useChat: (options?: { id?: string }) => ({
    id: options?.id ?? "test-chat",
    messages: mockChatState.messages,
    status: mockChatState.status,
    error: mockChatState.error,
    sendMessage: vi.fn(),
    regenerate: vi.fn(),
    addToolOutput: vi.fn(),
    stop: vi.fn(),
    setMessages: mockSetMessages,
    clearError: vi.fn(),
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

const mockThreads: CoachThreadSummary[] = SAMPLE_COACH_THREADS

vi.mock("@/hooks/use-coach-threads", () => ({
  useCoachThreads: () => ({
    items: mockThreads,
    total: mockThreads.length,
    isLoading: false,
    error: null,
    fetchThread: mockFetchThread,
    truncateMessages: vi.fn(),
    renameThread: vi.fn(),
    deleteThread: vi.fn(),
    revalidate: vi.fn(),
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

describe("Coach ?thread= deep-link hydration", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", `/coach?thread=${THREAD_1.id}`)
    mockSearchParams = new URLSearchParams(`thread=${THREAD_1.id}`)
    mockChatState = { messages: [], status: "ready", error: undefined }
    mockSetMessages.mockImplementation((next: CoachUIMessage[]) => {
      mockChatState = { ...mockChatState, messages: next }
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("loads a ?thread= deep link under React StrictMode without sticking on the loading skeleton", async () => {
    mockFetchThread.mockImplementation(
      (_threadId: string, options?: { signal?: AbortSignal }) =>
        new Promise((resolve, reject) => {
          const signal = options?.signal
          const rejectAborted = () => {
            reject(new DOMException("Aborted", "AbortError"))
          }
          if (signal?.aborted) {
            rejectAborted()
            return
          }
          signal?.addEventListener("abort", rejectAborted, { once: true })
          queueMicrotask(() => {
            if (signal?.aborted) {
              rejectAborted()
              return
            }
            resolve({
              thread: { ...THREAD_1, messages: [] },
              messages: SAMPLE_HYDRATED_TOOL_MESSAGES,
              sequenceByMessageId: {},
            })
          })
        })
    )

    render(
      <React.StrictMode>
        <CoachWorkspace />
      </React.StrictMode>
    )

    await waitFor(() => {
      expect(mockSetMessages).toHaveBeenCalledWith(
        SAMPLE_HYDRATED_TOOL_MESSAGES
      )
    })
    expect(
      screen.queryByTestId("coach-thread-loading-skeleton")
    ).not.toBeInTheDocument()
  })
})
