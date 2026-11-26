import * as React from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AxiosError, AxiosHeaders } from "axios"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CoachThreadList } from "@/components/coach/coach-thread-list"
import { CoachWorkspace } from "@/components/coach/coach-workspace"
import { DebriefCoachDrawer } from "@/components/coach/debrief-coach-drawer"
import { COACH_THREADS_SWR_KEY } from "@/hooks/use-coach-threads"
import type { CoachUIMessage } from "@/lib/ai/coach"
import { useAuthModalStore } from "@/stores/auth-modal-store"
import type { CoachThreadSummary } from "@/types/coach-thread"
import {
  createConnectionState,
  SAMPLE_CUSTOM_CHALLENGE,
  SAMPLE_PATTERNS,
} from "./coach-test-fixtures"

const mockPush = vi.fn()
const mockApiPost = vi.fn()
const mockApiDelete = vi.fn()
const mockSwrMutate = vi.fn()
const mockFetchThread = vi.fn()
const mockTruncateMessages = vi.fn()

let mockSearchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/coach",
}))

vi.mock("swr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("swr")>()
  return {
    ...actual,
    useSWRConfig: () => ({ mutate: mockSwrMutate }),
  }
})

vi.mock("@/lib/axios", () => ({
  apiClient: {
    get: vi.fn(),
    post: (...args: unknown[]) => mockApiPost(...args),
    patch: vi.fn(),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
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
    sendMessage: vi.fn(),
    regenerate: vi.fn(),
    addToolOutput: vi.fn(),
    stop: vi.fn(),
    setMessages: vi.fn(),
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

const DEBRIEF_THREAD: CoachThreadSummary = {
  id: "99999999-9999-4999-8999-999999999999",
  title: "Debrief: Async Race Condition",
  mode: "debrief",
  challenge_slug: "async-race-condition",
  message_count: 2,
  created_at: "2026-11-26T00:00:00Z",
  updated_at: "2026-11-26T00:00:00Z",
}

vi.mock("@/hooks/use-coach-threads", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/hooks/use-coach-threads")>()
  return {
    ...actual,
    useCoachThreads: () => ({
      items: [DEBRIEF_THREAD],
      total: 1,
      isLoading: false,
      error: null,
      fetchThread: mockFetchThread,
      truncateMessages: mockTruncateMessages,
      renameThread: vi.fn(),
      deleteThread: vi.fn(),
      revalidate: vi.fn(),
    }),
  }
})

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: 42, username: "reviewer", email: "rev@example.com" },
    isAuthenticated: true,
    isLoading: false,
  }),
}))

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

function buildConversation(count: number): CoachUIMessage[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `msg-${idx}`,
    role: idx % 2 === 0 ? "user" : "assistant",
    parts: [
      {
        type: "text",
        text: `Turn message ${idx + 1}`,
        ...(idx % 2 === 1 ? { providerMetadata: { secret: "strip-me" } } : {}),
      } as CoachUIMessage["parts"][number],
    ],
  }))
}

describe("Debrief-to-Coach handoff and debrief thread UI", () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams()
    mockChatState = { messages: [], status: "ready", error: undefined }
    useAuthModalStore.setState({ isOpen: false, initialTab: "signin" })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("uses an inclusive SWR key without mode=patterns filter", () => {
    expect(COACH_THREADS_SWR_KEY).toBe("/api/user/coach-threads?limit=50")
  })

  it("navigates to /coach?prompt=... when handing off with zero messages", async () => {
    const user = userEvent.setup()

    render(
      <DebriefCoachDrawer
        challengeSlug="async-race-condition"
        challengeTitle="Async Race Condition"
        userFlaggedLines={[12]}
        userComments=""
        gradeReport={null}
        solution={null}
      />
    )

    await user.click(screen.getByTestId("debrief-continue-in-coach"))

    expect(mockApiPost).not.toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledTimes(1)
    const targetUrl = mockPush.mock.calls[0][0] as string
    expect(targetUrl.startsWith("/coach?prompt=")).toBe(true)
    const decoded = decodeURIComponent(targetUrl.slice("/coach?prompt=".length))
    expect(decoded).toContain("async-race-condition")
    expect(decoded).toContain("Async Race Condition")
    expect(decoded).toContain("get_submission_debrief")
  })

  it("creates a debrief thread, appends messages in <=20 batches, strips providerMetadata, and routes to /coach?thread=<id>", async () => {
    const user = userEvent.setup()
    mockChatState = {
      messages: buildConversation(25),
      status: "ready",
      error: undefined,
    }
    mockApiPost
      .mockResolvedValueOnce({ data: DEBRIEF_THREAD })
      .mockResolvedValueOnce({ data: { message_count: 20 } })
      .mockResolvedValueOnce({ data: { message_count: 25 } })

    render(
      <DebriefCoachDrawer
        challengeSlug="async-race-condition"
        challengeTitle="Async Race Condition"
        userFlaggedLines={[12]}
        userComments=""
        gradeReport={null}
        solution={null}
      />
    )

    await user.click(screen.getByTestId("debrief-coach-toggle"))
    await user.click(screen.getByTestId("debrief-continue-in-coach"))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        `/coach?thread=${encodeURIComponent(DEBRIEF_THREAD.id)}`
      )
    })

    expect(mockApiPost).toHaveBeenCalledTimes(3)
    expect(mockApiPost).toHaveBeenNthCalledWith(1, "/api/user/coach-threads", {
      mode: "debrief",
      title: "Debrief: Async Race Condition",
      challenge_slug: "async-race-condition",
    })

    const firstBatchPayload = mockApiPost.mock.calls[1][1] as {
      messages: Array<{ parts: Array<Record<string, unknown>> }>
    }
    const secondBatchPayload = mockApiPost.mock.calls[2][1] as {
      messages: Array<{ parts: Array<Record<string, unknown>> }>
    }
    expect(firstBatchPayload.messages).toHaveLength(20)
    expect(secondBatchPayload.messages).toHaveLength(5)
    expect(firstBatchPayload.messages[1].parts[0]).not.toHaveProperty(
      "providerMetadata"
    )
    expect(mockSwrMutate).toHaveBeenCalled()
  })

  it("shows Sign In action on 401 and preserves drawer messages without navigating", async () => {
    const user = userEvent.setup()
    mockChatState = {
      messages: buildConversation(2),
      status: "ready",
      error: undefined,
    }
    mockApiPost.mockRejectedValueOnce(createAxiosStatusError(401))

    render(
      <DebriefCoachDrawer
        challengeSlug="async-race-condition"
        challengeTitle="Async Race Condition"
        userFlaggedLines={[12]}
        userComments=""
        gradeReport={null}
        solution={null}
      />
    )

    await user.click(screen.getByTestId("debrief-coach-toggle"))
    await user.click(screen.getByTestId("debrief-continue-in-coach"))

    const alert = await screen.findByTestId("debrief-handoff-error")
    expect(alert).toHaveAttribute("role", "alert")
    expect(mockPush).not.toHaveBeenCalled()
    expect(screen.getByText("Turn message 1")).toBeInTheDocument()

    await user.click(screen.getByTestId("debrief-handoff-signin"))
    expect(useAuthModalStore.getState().isOpen).toBe(true)
  })

  it("cleans up orphan thread via DELETE when batch append fails and shows error on 409 quota", async () => {
    const user = userEvent.setup()
    mockChatState = {
      messages: buildConversation(2),
      status: "ready",
      error: undefined,
    }
    mockApiPost
      .mockResolvedValueOnce({ data: DEBRIEF_THREAD })
      .mockRejectedValueOnce(createAxiosStatusError(500))
    mockApiDelete.mockResolvedValueOnce({})

    const { unmount } = render(
      <DebriefCoachDrawer
        challengeSlug="async-race-condition"
        challengeTitle="Async Race Condition"
        userFlaggedLines={[12]}
        userComments=""
        gradeReport={null}
        solution={null}
      />
    )

    await user.click(screen.getByTestId("debrief-coach-toggle"))
    await user.click(screen.getByTestId("debrief-continue-in-coach"))

    await waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledWith(
        `/api/user/coach-threads/${encodeURIComponent(DEBRIEF_THREAD.id)}`
      )
    })
    expect(screen.getByTestId("debrief-handoff-error")).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()

    unmount()
    vi.clearAllMocks()

    mockApiPost.mockRejectedValueOnce(createAxiosStatusError(409))
    render(
      <DebriefCoachDrawer
        challengeSlug="async-race-condition"
        challengeTitle="Async Race Condition"
        userFlaggedLines={[12]}
        userComments=""
        gradeReport={null}
        solution={null}
      />
    )
    await user.click(screen.getByTestId("debrief-coach-toggle"))
    await user.click(screen.getByTestId("debrief-continue-in-coach"))

    expect(
      await screen.findByTestId("debrief-handoff-open-coach")
    ).toHaveAttribute("href", "/coach")
  })

  it("renders Debrief badge in thread list and debrief context chip in CoachWorkspace", async () => {
    mockSearchParams = new URLSearchParams(`thread=${DEBRIEF_THREAD.id}`)
    mockFetchThread.mockResolvedValueOnce({
      thread: { ...DEBRIEF_THREAD, messages: [] },
      messages: buildConversation(2),
      sequenceByMessageId: { "msg-0": 0, "msg-1": 1 },
    })

    render(<CoachWorkspace />)

    const chip = await screen.findByTestId("coach-debrief-context-chip")
    expect(chip).toHaveTextContent("async-race-condition")
    expect(screen.getByTestId("coach-debrief-challenge-link")).toHaveAttribute(
      "href",
      "/challenges/async-race-condition"
    )

    cleanup()

    render(
      <CoachThreadList
        threads={[DEBRIEF_THREAD]}
        activeThreadId={DEBRIEF_THREAD.id}
        isLoading={false}
        onSelectThread={vi.fn()}
        onNewChat={vi.fn()}
        onRenameThread={vi.fn()}
        onDeleteThread={vi.fn()}
      />
    )

    expect(
      screen.getByTestId(`coach-thread-debrief-badge-${DEBRIEF_THREAD.id}`)
    ).toHaveTextContent("Debrief")
    expect(
      screen.getByTestId(`coach-thread-challenge-link-${DEBRIEF_THREAD.id}`)
    ).toHaveAttribute("href", "/challenges/async-race-condition")
  })
})
