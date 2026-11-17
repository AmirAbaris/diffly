"use client"

import useSWR from "swr"
import type { UserProgress } from "@/types/challenge"

export function useUserProgress() {
  const { data, error, isLoading, isValidating, mutate } =
    useSWR<UserProgress>("/api/user/progress")

  return {
    progress: data ?? null,
    error,
    isLoading,
    isValidating,
    mutate,
  }
}
