import * as React from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CustomChallengeButton } from "@/components/challenges/custom-challenge-button"
import { CustomChallengeModal } from "@/components/challenges/generator-modal/custom-challenge-modal"
import {
  getStoredGeminiKey,
  setStoredGeminiKey,
} from "@/hooks/use-custom-challenges"
import { useCustomChallengeModalStore } from "@/stores/custom-challenge-modal-store"
import type { ChallengeSummary } from "@/types/challenge"

const mockPush = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
  }),
  usePathname: () => "/challenges",
  useSearchParams: () => new URLSearchParams(),
}))

const mockDeleteCustomChallenge = vi.fn()
const mockGenerateCustomChallenge = vi.fn()

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
      deleteCustomChallenge: mockDeleteCustomChallenge,
      generateCustomChallenge: mockGenerateCustomChallenge,
      mutate: vi.fn(),
    }),
  }
})

describe("Custom Challenge Generator & Quota Flow", () => {
  beforeEach(() => {
    window.localStorage.clear()
    useCustomChallengeModalStore.setState({
      isOpen: false,
      initialTab: "generate",
    })
    mockPush.mockReset()
    mockDeleteCustomChallenge.mockReset()
    mockGenerateCustomChallenge.mockReset()

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
    it("renders 'Generate with AI' button and current quota badge", () => {
      mockTotal = 2
      mockQuotaLimit = 5
      render(<CustomChallengeButton />)

      const btn = screen.getByTestId("generate-ai-challenge-btn")
      expect(btn).toBeInTheDocument()
      expect(btn).toHaveTextContent(/generate with ai/i)

      const badge = screen.getByTestId("custom-challenges-quota-badge")
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveTextContent("Custom: 2/5")
    })

    it("opens modal with 'generate' tab when clicking generate button", async () => {
      const user = userEvent.setup()
      render(<CustomChallengeButton />)

      const btn = screen.getByTestId("generate-ai-challenge-btn")
      await user.click(btn)

      expect(useCustomChallengeModalStore.getState().isOpen).toBe(true)
      expect(useCustomChallengeModalStore.getState().initialTab).toBe(
        "generate"
      )
    })

    it("opens modal with 'manage' tab when clicking quota badge", async () => {
      const user = userEvent.setup()
      render(<CustomChallengeButton />)

      const badge = screen.getByTestId("custom-challenges-quota-badge")
      await user.click(badge)

      expect(useCustomChallengeModalStore.getState().isOpen).toBe(true)
      expect(useCustomChallengeModalStore.getState().initialTab).toBe("manage")
    })
  })

  describe("CustomChallengeModal Component", () => {
    it("renders closed when open=false", () => {
      render(<CustomChallengeModal open={false} />)
      expect(
        screen.queryByTestId("custom-challenge-modal-content")
      ).not.toBeInTheDocument()
    })

    it("renders modal with header, tabs, and direct Google AI Studio link", async () => {
      render(<CustomChallengeModal open={true} />)

      expect(
        await screen.findByTestId("custom-challenge-modal-content")
      ).toBeInTheDocument()
      expect(screen.getByText("Custom Challenge Generator")).toBeInTheDocument()
      expect(screen.getByTestId("modal-quota-badge")).toHaveTextContent(
        "1/5 Used"
      )

      const link = screen.getByTestId("get-gemini-key-link")
      expect(link).toHaveAttribute(
        "href",
        "https://aistudio.google.com/app/apikey"
      )
      expect(link).toHaveAttribute("target", "_blank")
      expect(link).toHaveAttribute("rel", "noopener noreferrer")

      expect(
        screen.getByText(
          /your key is stored only in your browser's local storage/i
        )
      ).toBeInTheDocument()
    })

    it("pre-fills saved Gemini API key from localStorage and remembers it", async () => {
      setStoredGeminiKey("AIzaSyTestStoredKey", true)
      expect(getStoredGeminiKey()).toBe("AIzaSyTestStoredKey")

      render(<CustomChallengeModal open={true} />)

      const keyInput = (await screen.findByTestId(
        "generator-api-key-input"
      )) as HTMLInputElement
      expect(keyInput.value).toBe("AIzaSyTestStoredKey")

      const rememberCheckbox = screen.getByTestId(
        "remember-key-checkbox"
      ) as HTMLInputElement
      expect(rememberCheckbox.checked).toBe(true)
    })

    it("enforces strict 5-challenge quota: disables generate button and displays banner", async () => {
      mockTotal = 5
      mockQuotaLimit = 5
      mockQuotaRemaining = 0
      mockIsQuotaFull = true

      render(<CustomChallengeModal open={true} />)

      const banner = await screen.findByTestId("quota-limit-banner")
      expect(banner).toBeInTheDocument()
      expect(
        screen.getByText(/you have reached your limit of 5 custom challenges/i)
      ).toBeInTheDocument()

      const submitBtn = screen.getByTestId("generate-challenge-submit-btn")
      expect(submitBtn).toBeDisabled()

      const user = userEvent.setup()
      const manageBtn = screen.getByTestId("quota-manage-btn")
      await user.click(manageBtn)

      expect(screen.getByTestId("tab-manage-trigger")).toHaveAttribute(
        "data-state",
        "active"
      )
    })

    it("manages custom challenges library: lists items and calls delete", async () => {
      const user = userEvent.setup()
      mockDeleteCustomChallenge.mockResolvedValueOnce({
        detail: "Custom challenge deleted successfully",
      })

      render(<CustomChallengeModal open={true} initialTab="manage" />)

      const manageTab = await screen.findByTestId("tab-manage-trigger")
      expect(manageTab).toHaveAttribute("data-state", "active")

      expect(
        screen.getByTestId("custom-challenge-item-101")
      ).toBeInTheDocument()
      expect(screen.getByText("FastAPI JWT Auth Bypass")).toBeInTheDocument()

      const deleteBtn = screen.getByTestId("delete-challenge-101")
      await user.click(deleteBtn)

      expect(mockDeleteCustomChallenge).toHaveBeenCalledWith(101)
    })

    it("successfully generates challenge and routes to /challenges/[slug]", async () => {
      const user = userEvent.setup()
      mockGenerateCustomChallenge.mockResolvedValueOnce({
        id: 102,
        slug: "nextjs-csrf-action-defect",
        title: "Next.js CSRF Action Defect",
        difficulty: "Medium",
        category: "Security",
        language: "typescript",
        description: "CSRF issue in Next.js Server Action",
        threat_model: "Attacker triggers state mutation",
        defect_target: "Server Action lacks token check",
        code_snippet: "export async function mutate() {}",
        estimated_minutes: 5,
        line_count: 20,
        total_hints: 3,
        is_solved: false,
        best_score: null,
      })

      render(<CustomChallengeModal open={true} />)

      const topicInput = await screen.findByTestId("generator-topic-input")
      const keyInput = screen.getByTestId("generator-api-key-input")

      await user.type(topicInput, "Next.js Server Actions CSRF")
      await user.type(keyInput, "AIzaSyCustomLiveKey123")

      const submitBtn = screen.getByTestId("generate-challenge-submit-btn")
      expect(submitBtn).toBeEnabled()
      await user.click(submitBtn)

      await waitFor(() => {
        expect(mockGenerateCustomChallenge).toHaveBeenCalledWith(
          {
            topic: "Next.js Server Actions CSRF",
            language: "python",
            difficulty: "Medium",
          },
          "AIzaSyCustomLiveKey123"
        )
        expect(mockPush).toHaveBeenCalledWith(
          "/challenges/nextjs-csrf-action-defect"
        )
      })
    })

    it("displays error banner when generation fails", async () => {
      const user = userEvent.setup()
      mockGenerateCustomChallenge.mockRejectedValueOnce(
        new Error("Gemini API key is invalid or unauthorized.")
      )

      render(<CustomChallengeModal open={true} />)

      const topicInput = await screen.findByTestId("generator-topic-input")
      const keyInput = screen.getByTestId("generator-api-key-input")

      await user.type(topicInput, "Go mutex deadlock")
      await user.type(keyInput, "invalid-key")

      const submitBtn = screen.getByTestId("generate-challenge-submit-btn")
      await user.click(submitBtn)

      const errorBanner = await screen.findByTestId("generator-error-banner")
      expect(errorBanner).toBeInTheDocument()
      expect(
        screen.getByText(/gemini api key is invalid or unauthorized/i)
      ).toBeInTheDocument()
    })
  })
})
