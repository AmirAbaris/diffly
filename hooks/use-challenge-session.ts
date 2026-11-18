"use client"

import * as React from "react"
import useSWR from "swr"
import { useChallenges } from "@/hooks/use-challenges"
import { useReviewDraft } from "@/hooks/use-review-draft"
import { toast } from "@/hooks/use-toast"
import { mutateUserStats } from "@/hooks/use-user-stats"
import { apiClient } from "@/lib/axios"
import { useArenaUIStore } from "@/stores/arena-ui-store"
import type {
  AsyncSlice,
  ChallengeLoadError,
  ChallengeSessionState,
} from "@/types/arena-session"
import type {
  ChallengeDetail,
  ChallengeHint,
  ReviewSubmissionResponse,
  SubmissionHistoryItem,
} from "@/types/challenge"

interface ErrorShape {
  message?: string
  code?: string
  response?: {
    status?: number
    data?: {
      detail?: unknown
    }
  }
}

function extractErrorDetail(error: unknown): string | undefined {
  const detail = (error as ErrorShape | null | undefined)?.response?.data
    ?.detail
  return typeof detail === "string" && detail.trim().length > 0
    ? detail.trim()
    : undefined
}

function extractErrorMessage(error: unknown, fallback: string): string {
  const detail = extractErrorDetail(error)
  if (detail) return detail
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return fallback
}

/**
 * Parses raw Axios/fetch errors into domain ChallengeLoadError at the boundary.
 */
export function parseChallengeLoadError(
  error: unknown,
  slug: string
): ChallengeLoadError {
  const errObj = error as ErrorShape | null | undefined
  const status = errObj?.response?.status
  const detail = extractErrorDetail(error)

  if (status === 404) {
    return {
      kind: "not-found",
      title: "Challenge Not Found",
      message: detail ?? `Could not find challenge "${slug}".`,
      retryable: false,
    }
  }

  if (status === 401 || status === 403) {
    return {
      kind: "unauthorized",
      title: status === 401 ? "Sign In Required" : "Access Restricted",
      message:
        detail ?? "Sign in or verify your permissions to view this challenge.",
      retryable: false,
    }
  }

  if (
    !errObj?.response ||
    status === 408 ||
    errObj?.code === "ECONNABORTED" ||
    errObj?.code === "ERR_NETWORK"
  ) {
    return {
      kind: "network",
      title: "Connection Error",
      message:
        detail ??
        "Unable to reach the server. Check your connection and try again.",
      retryable: true,
    }
  }

  return {
    kind: "server",
    title: "Failed to Load Challenge",
    message:
      detail ??
      "The server encountered an error while loading this challenge. Please try again.",
    retryable: true,
  }
}

function toAsyncSlice<T>(
  data: T | undefined,
  error: unknown,
  isLoading: boolean,
  fallbackError: string,
  retry: () => void
): AsyncSlice<T> {
  if (data !== undefined) {
    return { status: "ready", data }
  }
  if (error && !isLoading) {
    return {
      status: "error",
      message: extractErrorMessage(error, fallbackError),
      retry,
    }
  }
  return { status: "loading" }
}

/**
 * Owns the complete lifecycle for /challenges/[slug]:
 * parallel SWR fetches with `keepPreviousData: false`, UI reset on slug change,
 * slug verification, draft binding, and review submission.
 */
export function useChallengeSession(slug: string): ChallengeSessionState {
  const challengeQuery = useSWR<ChallengeDetail>(
    slug ? `/api/challenges/${slug}` : null,
    { keepPreviousData: false }
  )
  const hintsQuery = useSWR<ChallengeHint[]>(
    slug ? `/api/challenges/${slug}/hints` : null,
    { keepPreviousData: false }
  )
  const historyQuery = useSWR<SubmissionHistoryItem[]>(
    slug ? `/api/challenges/${slug}/submissions` : null,
    { keepPreviousData: false }
  )

  const { challenges } = useChallenges()
  const draft = useReviewDraft(slug)

  const isSubmitting = useArenaUIStore((s) => s.isSubmitting)
  const setIsSubmitting = useArenaUIStore((s) => s.setIsSubmitting)
  const setSubmissionResult = useArenaUIStore((s) => s.setSubmissionResult)
  const setIsResultModalOpen = useArenaUIStore((s) => s.setIsResultModalOpen)
  const setSubmittedReview = useArenaUIStore((s) => s.setSubmittedReview)

  const resetArenaUI = useArenaUIStore((s) => s.resetArenaUI)

  React.useEffect(() => {
    if (slug) {
      resetArenaUI()
    }
  }, [slug, resetArenaUI])

  const verifiedChallenge =
    challengeQuery.data && challengeQuery.data.slug === slug
      ? challengeQuery.data
      : undefined

  const nextChallengeSlug = React.useMemo(() => {
    if (!challenges || challenges.length === 0) return null
    const currentIndex = challenges.findIndex(
      (c) =>
        c.slug === slug ||
        (verifiedChallenge?.id !== undefined && c.id === verifiedChallenge.id)
    )
    if (currentIndex >= 0 && currentIndex < challenges.length - 1) {
      return challenges[currentIndex + 1].slug
    }
    return null
  }, [challenges, slug, verifiedChallenge?.id])

  const submitReview =
    React.useCallback(async (): Promise<ReviewSubmissionResponse | null> => {
      if (
        !verifiedChallenge ||
        !draft.flaggedLines.length ||
        !draft.comments.trim() ||
        isSubmitting
      ) {
        return null
      }

      setIsSubmitting(true)
      const targetId = verifiedChallenge.id ?? slug
      const submittedLines = draft.flaggedLines
      const submittedComments = draft.comments.trim()

      try {
        const response = await apiClient.post<ReviewSubmissionResponse>(
          `/api/challenges/${targetId}/review`,
          {
            flagged_lines: submittedLines,
            comments: submittedComments,
          }
        )

        toast({
          title: "Review submitted successfully",
          description: `Score: ${response.data.score}% · Review breakdown loaded.`,
          variant: "success",
        })

        setSubmittedReview((prev) => ({
          flaggedLines:
            response.data.flagged_lines &&
            response.data.flagged_lines.length > 0
              ? response.data.flagged_lines
              : (prev?.flaggedLines ?? submittedLines),
          comments:
            response.data.comments && response.data.comments.length > 0
              ? response.data.comments
              : (prev?.comments ?? submittedComments),
        }))
        setSubmissionResult(response.data)
        setIsResultModalOpen(true)

        void historyQuery.mutate()
        void challengeQuery.mutate()
        void mutateUserStats()

        draft.resetDraft()
        return response.data
      } catch (err: unknown) {
        const errorMsg = extractErrorMessage(err, "Failed to submit review")
        toast({
          title: "Submission failed",
          description: errorMsg,
          variant: "destructive",
        })
        return null
      } finally {
        setIsSubmitting(false)
      }
    }, [
      verifiedChallenge,
      draft,
      isSubmitting,
      setIsSubmitting,
      slug,
      setSubmittedReview,
      setSubmissionResult,
      setIsResultModalOpen,
      historyQuery,
      challengeQuery,
    ])

  const refresh = React.useCallback(() => {
    void challengeQuery.mutate()
    void hintsQuery.mutate()
    void historyQuery.mutate()
  }, [challengeQuery, hintsQuery, historyQuery])

  if (!slug) {
    return { status: "loading", slug }
  }

  if (!verifiedChallenge) {
    if (challengeQuery.error && !challengeQuery.isLoading) {
      return {
        status: "error",
        slug,
        error: parseChallengeLoadError(challengeQuery.error, slug),
        retry: () => {
          void challengeQuery.mutate()
        },
      }
    }
    return { status: "loading", slug }
  }

  const hints = toAsyncSlice(
    hintsQuery.data,
    hintsQuery.error,
    hintsQuery.isLoading,
    "Failed to load hints",
    () => {
      void hintsQuery.mutate()
    }
  )

  const history = toAsyncSlice(
    historyQuery.data,
    historyQuery.error,
    historyQuery.isLoading,
    "Failed to load submission history",
    () => {
      void historyQuery.mutate()
    }
  )

  return {
    status: "ready",
    slug,
    challenge: verifiedChallenge,
    hints,
    history,
    nextChallengeSlug,
    draft: {
      flaggedLines: draft.flaggedLines,
      comments: draft.comments,
      setComments: draft.setComments,
      toggleFlaggedLine: draft.toggleFlaggedLine,
      clearFlaggedLines: draft.clearFlaggedLines,
      resetDraft: draft.resetDraft,
    },
    isSubmitting,
    isRevalidating: challengeQuery.isValidating,
    submitReview,
    refresh,
  }
}
