"use client"

import useSWR from "swr"
import { useTimezonePreference } from "@/hooks/use-timezone-preference"
import type { AnalyticsWindowDays, UserAnalytics } from "@/types/analytics"

export const USER_ANALYTICS_SWR_KEY = "/api/user/analytics"

export function buildUserAnalyticsUrl(
  timezone: string,
  days: AnalyticsWindowDays | number = 90
): string {
  const params = new URLSearchParams({
    tz: timezone,
    days: String(days),
  })
  return `${USER_ANALYTICS_SWR_KEY}?${params.toString()}`
}

export function useUserAnalytics(days: AnalyticsWindowDays = 90) {
  const { timezone } = useTimezonePreference()
  const key = buildUserAnalyticsUrl(timezone, days)

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<UserAnalytics>(key, {
      shouldRetryOnError: false,
    })

  return {
    analytics: data ?? null,
    timezone: data?.timezone ?? timezone,
    days,
    error,
    isLoading,
    isValidating,
    mutate,
  }
}
