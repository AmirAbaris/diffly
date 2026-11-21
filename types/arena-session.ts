import type {
  ChallengeDetail,
  ChallengeHint,
  FlaggedLine,
  ReviewSubmissionResponse,
  SubmissionHistoryItem,
} from "@/types/challenge"

/**
 * Domain error parsed at the transport boundary (Axios/SWR -> domain).
 */
export type ChallengeLoadErrorKind =
  "not-found" | "unauthorized" | "network" | "server"

export interface ChallengeLoadError {
  kind: ChallengeLoadErrorKind
  title: string
  message: string
  retryable: boolean
}

/**
 * Non-blocking sub-resource state for secondary arena panels (hints, history).
 */
export type AsyncSlice<T> =
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; data: T }

export interface ArenaDraftActions {
  flaggedLines: FlaggedLine[]
  comments: string
  setComments: (value: string) => void
  toggleFlaggedLine: (line: FlaggedLine) => void
  clearFlaggedLines: () => void
  resetDraft: () => void
}

export interface ReadyChallengeSession {
  status: "ready"
  slug: string
  challenge: ChallengeDetail
  hints: AsyncSlice<ChallengeHint[]>
  history: AsyncSlice<SubmissionHistoryItem[]>
  nextChallengeSlug: string | null
  draft: ArenaDraftActions
  isSubmitting: boolean
  isRevalidating: boolean
  submitReview: () => Promise<ReviewSubmissionResponse | null>
  refresh: () => void
}

export type ChallengeSessionState =
  | { status: "loading"; slug: string }
  | {
      status: "error"
      slug: string
      error: ChallengeLoadError
      retry: () => void
    }
  | ReadyChallengeSession
