"use client"

import useSWR from "swr"
import { useShareTokenContext } from "@/components/review/share-token-context"
import { appendShareTokenQuery } from "@/lib/share-url"
import type { SubmissionHistoryItem } from "@/types/challenge"

export function useSubmissionHistory(
  slug: string | null | undefined,
  shareToken?: string | null
) {
  const { slug: ctxSlug, shareToken: ctxToken } = useShareTokenContext()
  const resolvedToken =
    shareToken ?? (slug && ctxSlug === slug ? ctxToken : null)

  const endpoint = slug
    ? appendShareTokenQuery(
        `/api/challenges/${slug}/submissions`,
        resolvedToken
      )
    : null

  const { data, error, isLoading, isValidating, mutate } = useSWR<
    SubmissionHistoryItem[]
  >(endpoint, {
    keepPreviousData: false,
  })

  return {
    submissions: data ?? [],
    error,
    isLoading,
    isValidating,
    mutate,
  }
}
