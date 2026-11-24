import { vi } from "vitest"
import type { AIProviderId } from "@/lib/ai/catalog"
import type { CoachPatternsSnapshot, CoachUIMessage } from "@/lib/ai/coach"
import type { ChallengeSummary } from "@/types/challenge"

export const createConnectionState = () => ({
  isConnected: true,
  provider: "anthropic" as AIProviderId | null,
  model: "claude-sonnet-5-5" as string | null,
  baseUrl: null as string | null,
  maskedKey: "sk-a••••1234" as string | null,
  isLoading: false,
  isValidating: false,
  isSaving: false,
  isDisconnecting: false,
  error: null as Error | null,
  saveConnection: vi.fn(),
  disconnect: vi.fn(),
  mutate: vi.fn(),
})

export const SAMPLE_CUSTOM_CHALLENGE: ChallengeSummary = {
  id: 101,
  slug: "custom-jwt-bypass",
  title: "FastAPI JWT Auth Bypass",
  difficulty: "Medium",
  category: "Security",
  language: "python",
  description: "Spot JWT verification flaw.",
  estimated_minutes: 10,
  line_count: 42,
  total_hints: 2,
  is_solved: false,
  best_score: null,
}

export const SAMPLE_PATTERNS: CoachPatternsSnapshot = {
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
}

export const SAMPLE_DRILL_MESSAGES: CoachUIMessage[] = [
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
]
