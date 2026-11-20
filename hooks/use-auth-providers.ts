"use client"

import useSWR from "swr"
import type { AuthProvidersResponse } from "@/types/analytics"

export const AUTH_PROVIDERS_SWR_KEY = "/api/auth/providers"

export function useAuthProviders() {
  const { data, error, isLoading, mutate } = useSWR<AuthProvidersResponse>(
    AUTH_PROVIDERS_SWR_KEY,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  )

  return {
    providers: data ?? { github: false },
    githubEnabled: Boolean(data?.github),
    isLoading,
    error,
    mutate,
  }
}
