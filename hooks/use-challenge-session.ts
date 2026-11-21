"use client"

import * as React from "react"
import useSWR from "swr"
import { useChallenges } from "@/hooks/use-challenges"
import { useCustomChallenges } from "@/hooks/use-custom-challenges"
import { useReviewDraft } from "@/hooks/use-review-draft"
import { toast } from "@/hooks/use-toast"
import { mutateUserStats } from "@/hooks/use-user-stats"
import { apiClient } from "@/lib/axios"
import { resolveNextChallengeSlug } from "@/lib/challenge-progression"
import {
  buildLineSpace,
  buildUnboundedLineSpace,
  parseGradeReport,
  toSubmissionBody,
} from "@/lib/review"
import { appendShareTokenQuery } from "@/lib/share-url"
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
export function useChallengeSession(
  slug: string,
  shareToken?: string
): ChallengeSessionState {
  const challengeUrl = slug
    ? appendShareTokenQuery(`/api/challenges/${slug}`, shareToken)
    : null
  const hintsUrl = slug
    ? appendShareTokenQuery(`/api/challenges/${slug}/hints`, shareToken)
    : null
  const historyUrl = slug
    ? appendShareTokenQuery(`/api/challenges/${slug}/submissions`, shareToken)
    : null

  const challengeQuery = useSWR<ChallengeDetail>(challengeUrl, {
    keepPreviousData: false,
  })
  const hintsQuery = useSWR<ChallengeHint[]>(hintsUrl, {
    keepPreviousData: false,
  })
  const historyQuery = useSWR<SubmissionHistoryItem[]>(historyUrl, {
    keepPreviousData: false,
  })

  const { challenges } = useChallenges()
  const isOwnedCustomChallenge =
    challengeQuery.data?.is_public === false &&
    challengeQuery.data?.is_owner === true
  const { customChallenges } = useCustomChallenges({
    enabled: isOwnedCustomChallenge,
  })
  const challengeErrorStatus = (
    challengeQuery.error as ErrorShape | null | undefined
  )?.response?.status
  const hasAccessError =
    challengeErrorStatus === 401 ||
    challengeErrorStatus === 403 ||
    challengeErrorStatus === 404

  const verifiedChallenge =
    !hasAccessError && challengeQuery.data && challengeQuery.data.slug === slug
      ? challengeQuery.data
      : undefined

  const lineSpace = React.useMemo(
    () =>
      verifiedChallenge
        ? buildLineSpace({
            code: verifiedChallenge.code_snippet,
            files: verifiedChallenge.files,
          })
        : buildUnboundedLineSpace(),
    [verifiedChallenge]
  )

  const draft = useReviewDraft(slug, lineSpace)

  const isSubmitting = useArenaUIStore((s) => s.isSubmitting)
  const setIsSubmitting = useArenaUIStore((s) => s.setIsSubmitting)
  const setSubmissionResult = useArenaUIStore((s) => s.setSubmissionResult)
  const setGradeReport = useArenaUIStore((s) => s.setGradeReport)
  const setIsResultModalOpen = useArenaUIStore((s) => s.setIsResultModalOpen)
  const setSubmittedReview = useArenaUIStore((s) => s.setSubmittedReview)

  const resetArenaUI = useArenaUIStore((s) => s.resetArenaUI)
  const activeSlugRef = React.useRef(slug)
  const isMountedRef = React.useRef(true)

  React.useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  React.useEffect(() => {
    activeSlugRef.current = slug
    if (slug) {
      resetArenaUI()
    }
    return () => {
      resetArenaUI()
    }
  }, [slug, resetArenaUI])

  const nextChallengeSlug = React.useMemo(
    () =>
      resolveNextChallengeSlug({
        currentSlug: slug,
        currentChallenge: verifiedChallenge,
        publicChallenges: challenges,
        customChallenges,
      }),
    [slug, verifiedChallenge, challenges, customChallenges]
  )

  const submitReview =
    React.useCallback(async (): Promise<ReviewSubmissionResponse | null> => {
      if (!verifiedChallenge || !draft.validation.valid || isSubmitting) {
        return null
      }

      setIsSubmitting(true)
      const targetId = verifiedChallenge.id ?? slug
      const submittedLines = draft.flaggedLines
      const submittedComments = draft.comments.trim()
      const requestBody = toSubmissionBody(draft.draft, false)

      try {
        const reviewEndpoint = appendShareTokenQuery(
          `/api/challenges/${targetId}/review`,
          shareToken
        )
        const response = await apiClient.post<ReviewSubmissionResponse>(
          reviewEndpoint,
          requestBody
        )

        if (!isMountedRef.current || activeSlugRef.current !== slug) {
          return null
        }

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
        setGradeReport(parseGradeReport(response.data))
        setIsResultModalOpen(true)

        void historyQuery.mutate()
        void challengeQuery.mutate()
        void mutateUserStats()

        draft.resetDraft()
        return response.data
      } catch (err: unknown) {
        if (!isMountedRef.current || activeSlugRef.current !== slug) {
          return null
        }
        const errorMsg = extractErrorMessage(err, "Failed to submit review")
        toast({
          title: "Submission failed",
          description: errorMsg,
          variant: "destructive",
        })
        return null
      } finally {
        if (isMountedRef.current && activeSlugRef.current === slug) {
          setIsSubmitting(false)
        }
      }
    }, [
      verifiedChallenge,
      draft,
      isSubmitting,
      setIsSubmitting,
      slug,
      setSubmittedReview,
      setSubmissionResult,
      setGradeReport,
      setIsResultModalOpen,
      historyQuery,
      challengeQuery,
      shareToken,
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
    lineSpace,
    hints,
    history,
    nextChallengeSlug,
    draft: {
      reviewDraft: draft.draft,
      dispatch: draft.dispatch,
      validation: draft.validation,
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
