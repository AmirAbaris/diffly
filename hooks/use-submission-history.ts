"use client"

import useSWR from "swr"
import type { SubmissionHistoryItem } from "@/types/challenge"

export function useSubmissionHistory(slug: string | null | undefined) {
  const endpoint = slug ? `/api/challenges/${slug}/submissions` : null

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<SubmissionHistoryItem[]>(endpoint)

  return {
    submissions: data ?? [],
    error,
    isLoading,
    isValidating,
    mutate,
  }
}
