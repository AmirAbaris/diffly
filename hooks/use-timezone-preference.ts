"use client"

import * as React from "react"
import { TIMEZONE_PREFERENCE_STORAGE_KEY } from "@/lib/storage-keys"

const TIMEZONE_CHANGE_EVENT = "diffly:timezone-preference-change"

const FALLBACK_TIMEZONES: readonly string[] = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Istanbul",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
]

export function detectBrowserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz && tz.trim().length > 0 ? tz : "UTC"
  } catch {
    return "UTC"
  }
}

export function getSupportedTimezones(extraTimezones: string[] = []): string[] {
  const tzSet = new Set<string>(["UTC"])

  try {
    const intlWithSupported = Intl as typeof Intl & {
      supportedValuesOf?: (key: string) => string[]
    }
    if (typeof intlWithSupported.supportedValuesOf === "function") {
      for (const tz of intlWithSupported.supportedValuesOf("timeZone")) {
        if (tz) tzSet.add(tz)
      }
    } else {
      for (const tz of FALLBACK_TIMEZONES) {
        tzSet.add(tz)
      }
    }
  } catch {
    for (const tz of FALLBACK_TIMEZONES) {
      tzSet.add(tz)
    }
  }

  for (const tz of extraTimezones) {
    if (tz && tz.trim().length > 0) {
      tzSet.add(tz.trim())
    }
  }

  return Array.from(tzSet).sort((a, b) => a.localeCompare(b))
}

export function isValidTimeZone(candidate: string): boolean {
  const trimmed = candidate.trim()
  if (!trimmed) return false
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed })
    return true
  } catch {
    return false
  }
}

function readStoredTimezoneOverride(): string | null {
  if (typeof window === "undefined") {
    return null
  }
  try {
    const raw = window.localStorage.getItem(TIMEZONE_PREFERENCE_STORAGE_KEY)
    const trimmed = raw?.trim()
    if (!trimmed || !isValidTimeZone(trimmed)) {
      return null
    }
    return trimmed
  } catch {
    return null
  }
}

function writeStoredTimezoneOverride(tz: string | null): void {
  if (typeof window === "undefined") {
    return
  }
  try {
    const trimmed = tz?.trim()
    if (trimmed && isValidTimeZone(trimmed)) {
      window.localStorage.setItem(TIMEZONE_PREFERENCE_STORAGE_KEY, trimmed)
    } else {
      window.localStorage.removeItem(TIMEZONE_PREFERENCE_STORAGE_KEY)
    }
    window.dispatchEvent(new Event(TIMEZONE_CHANGE_EVENT))
  } catch {
    // Ignore localStorage failures in restricted environments
  }
}

function subscribeTimezone(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {}
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === TIMEZONE_PREFERENCE_STORAGE_KEY) {
      callback()
    }
  }

  window.addEventListener("storage", handleStorage)
  window.addEventListener(TIMEZONE_CHANGE_EVENT, callback)

  return () => {
    window.removeEventListener("storage", handleStorage)
    window.removeEventListener(TIMEZONE_CHANGE_EVENT, callback)
  }
}

function subscribeNoop(): () => void {
  return () => {}
}

export function useTimezonePreference() {
  const storedOverride = React.useSyncExternalStore(
    subscribeTimezone,
    readStoredTimezoneOverride,
    () => null
  )

  const detectedTimezone = React.useSyncExternalStore(
    subscribeNoop,
    detectBrowserTimezone,
    () => "UTC"
  )

  const timezone = storedOverride ?? detectedTimezone
  const isAuto = storedOverride === null

  const setTimezonePreference = React.useCallback((nextTimezone: string) => {
    const trimmed = nextTimezone.trim()
    if (!trimmed || trimmed === "auto") {
      writeStoredTimezoneOverride(null)
      return
    }
    writeStoredTimezoneOverride(trimmed)
  }, [])

  const resetTimezonePreference = React.useCallback(() => {
    writeStoredTimezoneOverride(null)
  }, [])

  const availableTimezones = React.useMemo(
    () =>
      getSupportedTimezones(
        storedOverride ? [detectedTimezone, storedOverride] : [detectedTimezone]
      ),
    [detectedTimezone, storedOverride]
  )

  return {
    timezone,
    detectedTimezone,
    overrideTimezone: storedOverride,
    isAuto,
    availableTimezones,
    setTimezonePreference,
    resetTimezonePreference,
  }
}
