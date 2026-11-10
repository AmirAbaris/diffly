"use client"

import useSWR from "swr"
import { apiClient } from "@/lib/axios"
import type { ClaimSessionResponse, UserProgress } from "@/types/challenge"

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

export async function claimSession(
  sessionId?: string | null
): Promise<ClaimSessionResponse> {
  const response = await apiClient.post<ClaimSessionResponse>(
    "/api/user/claim-session",
    sessionId ? { session_id: sessionId } : {}
  )
  return response.data
}
