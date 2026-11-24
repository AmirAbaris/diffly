import * as React from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CustomChallengeButton } from "@/components/challenges/custom-challenge-button"
import {
  COACH_CREATE_CHALLENGE_HREF,
  CustomChallengeModal,
} from "@/components/challenges/generator-modal/custom-challenge-modal"
import { CREATE_CHALLENGE_PROMPT } from "@/components/coach/use-coach-chat"
import { useCustomChallengeModalStore } from "@/stores/custom-challenge-modal-store"
import type { ChallengeSummary } from "@/types/challenge"

const mockDeleteCustomChallenge = vi.fn()
const mockToggleChallengeShare = vi.fn()

let mockCustomChallenges: ChallengeSummary[] = []
let mockTotal = 0
let mockQuotaLimit = 5
let mockQuotaRemaining = 5
let mockIsQuotaFull = false
let mockIsLoading = false

vi.mock("@/hooks/use-custom-challenges", async () => {
  const actual = await vi.importActual<
    typeof import("@/hooks/use-custom-challenges")
  >("@/hooks/use-custom-challenges")
  return {
    ...actual,
    useCustomChallenges: () => ({
      customChallenges: mockCustomChallenges,
      total: mockTotal,
      quotaLimit: mockQuotaLimit,
      quotaRemaining: mockQuotaRemaining,
      isQuotaFull: mockIsQuotaFull,
      isLoading: mockIsLoading,
      quotaSyncState: "idle",
      isSyncingQuota: false,
      resetQuotaSyncState: vi.fn(),
      deleteCustomChallenge: mockDeleteCustomChallenge,
      toggleChallengeShare: mockToggleChallengeShare,
      generateCustomChallenge: vi.fn(),
      mutate: vi.fn(),
    }),
  }
})

describe("Custom Challenge Library & Quota Flow", () => {
  beforeEach(() => {
    window.localStorage.clear()
    useCustomChallengeModalStore.setState({
      isOpen: false,
    })
    mockDeleteCustomChallenge.mockReset()
    mockToggleChallengeShare.mockReset()

    mockCustomChallenges = [
      {
        id: 101,
        slug: "fastapi-jwt-bypass-custom",
        title: "FastAPI JWT Auth Bypass",
        difficulty: "Medium",
        category: "Security",
        language: "python",
        description: "Custom generated challenge on JWT validation",
        estimated_minutes: 5,
        line_count: 24,
        total_hints: 3,
        is_solved: false,
        best_score: null,
      },
    ]
    mockTotal = 1
    mockQuotaLimit = 5
    mockQuotaRemaining = 4
    mockIsQuotaFull = false
    mockIsLoading = false
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  describe("CustomChallengeButton Component", () => {
    it("renders 'AI Coach & Generate' link to /coach and current quota badge", () => {
      mockTotal = 2
      mockQuotaLimit = 5
      render(<CustomChallengeButton />)

      const btn = screen.getByTestId("generate-ai-challenge-btn")
      expect(btn).toBeInTheDocument()
      expect(btn).toHaveTextContent(/ai coach & generate/i)
      expect(btn).toHaveAttribute("href", "/coach")

      const badge = screen.getByTestId("custom-challenges-quota-badge")
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveTextContent("Custom: 2/5")
    })

    it("opens the library modal when clicking quota badge", async () => {
      const user = userEvent.setup()
      render(<CustomChallengeButton />)

      const badge = screen.getByTestId("custom-challenges-quota-badge")
      await user.click(badge)

      expect(useCustomChallengeModalStore.getState().isOpen).toBe(true)
    })
  })

  describe("CustomChallengeModal Component", () => {
    const expectedCoachHref = `/coach?prompt=${encodeURIComponent(CREATE_CHALLENGE_PROMPT)}`

    it("renders closed when open=false", () => {
      render(<CustomChallengeModal open={false} />)
      expect(
        screen.queryByTestId("custom-challenge-modal-content")
      ).not.toBeInTheDocument()
    })

    it("renders single-purpose Library modal without tabs or legacy generator form", async () => {
      render(<CustomChallengeModal open={true} />)

      expect(
        await screen.findByTestId("custom-challenge-modal-content")
      ).toBeInTheDocument()
      expect(screen.getByText("Custom Challenge Library")).toBeInTheDocument()
      expect(
        screen.getByText(
          "Manage your private AI-generated challenges. Create new challenges in Agent Coach."
        )
      ).toBeInTheDocument()
      expect(screen.getByTestId("modal-quota-badge")).toHaveTextContent(
        "1/5 Used"
      )

      expect(
        screen.queryByTestId("tab-generate-trigger")
      ).not.toBeInTheDocument()
      expect(screen.queryByTestId("tab-manage-trigger")).not.toBeInTheDocument()
      expect(screen.queryByRole("tab")).not.toBeInTheDocument()
      expect(
        screen.queryByTestId("generator-topic-input")
      ).not.toBeInTheDocument()
      expect(
        screen.queryByTestId("generate-challenge-submit-btn")
      ).not.toBeInTheDocument()
    })

    it("links 'Create in Agent Coach' footer button to /coach?prompt=... and closes modal", async () => {
      const user = userEvent.setup()
      useCustomChallengeModalStore.setState({ isOpen: true })

      render(<CustomChallengeModal />)

      const coachCreateBtn = await screen.findByTestId(
        "modal-open-coach-create-btn"
      )
      expect(COACH_CREATE_CHALLENGE_HREF).toBe(expectedCoachHref)
      expect(coachCreateBtn).toHaveTextContent("Create in Agent Coach")
      expect(coachCreateBtn).toHaveAttribute("href", expectedCoachHref)

      await user.click(coachCreateBtn)

      expect(useCustomChallengeModalStore.getState().isOpen).toBe(false)
    })

    it("lists custom challenges and calls delete", async () => {
      const user = userEvent.setup()
      mockDeleteCustomChallenge.mockResolvedValueOnce({
        detail: "Custom challenge deleted successfully",
      })

      render(<CustomChallengeModal open={true} />)

      expect(
        await screen.findByTestId("custom-challenge-item-101")
      ).toBeInTheDocument()
      expect(screen.getByText("FastAPI JWT Auth Bypass")).toBeInTheDocument()

      const deleteBtn = screen.getByTestId("delete-challenge-101")
      await user.click(deleteBtn)

      expect(mockDeleteCustomChallenge).toHaveBeenCalledWith(101)
    })

    it("toggles unlisted share and copies link from Library list", async () => {
      const user = userEvent.setup()
      const writeTextSpy = vi.spyOn(navigator.clipboard, "writeText")
      mockToggleChallengeShare.mockResolvedValueOnce({
        id: 101,
        slug: "fastapi-jwt-bypass-custom",
        is_shared: true,
        share_token: "tok_modal_101",
      })

      render(<CustomChallengeModal open={true} />)

      const shareBtn = await screen.findByTestId("toggle-share-challenge-101")
      await user.click(shareBtn)

      expect(mockToggleChallengeShare).toHaveBeenCalledWith(101, true)
      await waitFor(() => {
        expect(writeTextSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            "/challenges/fastapi-jwt-bypass-custom?share_token=tok_modal_101"
          )
        )
      })
    })

    it("renders provider-neutral empty state with 'Create in Agent Coach' link", async () => {
      const user = userEvent.setup()
      mockCustomChallenges = []
      mockTotal = 0
      useCustomChallengeModalStore.setState({ isOpen: true })

      render(<CustomChallengeModal />)

      const empty = await screen.findByTestId("custom-challenges-empty")
      expect(empty).toHaveTextContent(/connected ai provider/i)
      expect(empty).not.toHaveTextContent(/gemini/i)

      const createBtn = screen.getByTestId("create-first-challenge-btn")
      expect(createBtn).toHaveTextContent("Create in Agent Coach")
      expect(createBtn).toHaveAttribute("href", expectedCoachHref)

      await user.click(createBtn)
      expect(useCustomChallengeModalStore.getState().isOpen).toBe(false)
    })
  })
})
