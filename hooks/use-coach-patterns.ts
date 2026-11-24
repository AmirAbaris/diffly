"use client"

import useSWR from "swr"
import type { CoachPatternsSnapshot } from "@/lib/ai/coach"

export const COACH_PATTERNS_SWR_KEY =
  "/api/user/coach-patterns?slice_limit=5&missed_limit=6"

export function useCoachPatterns() {
  const { data, error, isLoading, mutate } = useSWR<CoachPatternsSnapshot>(
    COACH_PATTERNS_SWR_KEY,
    {
      shouldRetryOnError: false,
    }
  )

  return {
    patterns: data ?? null,
    isLoading,
    error: error ?? null,
    mutate,
  }
}
