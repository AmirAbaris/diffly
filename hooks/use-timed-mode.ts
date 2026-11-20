"use client"

import * as React from "react"
import {
  TIMED_MODE_ENABLED_STORAGE_KEY,
  TIMED_MODE_MINUTES_STORAGE_KEY,
} from "@/lib/storage-keys"

export type TimerPresetMinutes = 5 | 10 | 15

export const TIMER_PRESETS: readonly TimerPresetMinutes[] = [5, 10, 15]
const TIMED_MODE_CHANGE_EVENT = "diffly:timed-mode-change"

function parsePresetMinutes(raw: string | null): TimerPresetMinutes {
  if (raw === "5") return 5
  if (raw === "15") return 15
  return 10
}

function readStoredEnabled(): boolean {
  if (typeof window === "undefined") return false
  try {
    return (
      window.localStorage.getItem(TIMED_MODE_ENABLED_STORAGE_KEY) === "true"
    )
  } catch {
    return false
  }
}

function readStoredMinutes(): TimerPresetMinutes {
  if (typeof window === "undefined") return 10
  try {
    return parsePresetMinutes(
      window.localStorage.getItem(TIMED_MODE_MINUTES_STORAGE_KEY)
    )
  } catch {
    return 10
  }
}

function subscribeTimedMode(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {}
  }

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === TIMED_MODE_ENABLED_STORAGE_KEY ||
      event.key === TIMED_MODE_MINUTES_STORAGE_KEY
    ) {
      callback()
    }
  }

  window.addEventListener("storage", handleStorage)
  window.addEventListener(TIMED_MODE_CHANGE_EVENT, callback)

  return () => {
    window.removeEventListener("storage", handleStorage)
    window.removeEventListener(TIMED_MODE_CHANGE_EVENT, callback)
  }
}

function getMilestoneAnnouncement(
  remainingSeconds: number,
  presetMinutes: TimerPresetMinutes,
  fallback: string
): string {
  if (remainingSeconds === 0) return "Time's up"
  if (remainingSeconds === 30) return "30 seconds remaining"
  if (remainingSeconds === 60) return "1 minute remaining"
  if (remainingSeconds === 300 && presetMinutes > 5) {
    return "5 minutes remaining"
  }
  return fallback
}

export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
}

export function useTimedMode() {
  const isEnabled = React.useSyncExternalStore(
    subscribeTimedMode,
    readStoredEnabled,
    () => false
  )
  const presetMinutes: TimerPresetMinutes = React.useSyncExternalStore(
    subscribeTimedMode,
    readStoredMinutes,
    (): TimerPresetMinutes => 10
  )

  const [timerState, setTimerState] = React.useState<{
    remaining: number | null
    announcement: string
  }>({
    remaining: null,
    announcement: "",
  })

  const displayedSeconds = timerState.remaining ?? presetMinutes * 60
  const isRunning = isEnabled && displayedSeconds > 0

  React.useEffect(() => {
    if (!isRunning) {
      return
    }

    const intervalId = window.setInterval(() => {
      setTimerState((prev) => {
        const current = prev.remaining ?? presetMinutes * 60
        const next = current <= 1 ? 0 : current - 1
        return {
          remaining: next,
          announcement: getMilestoneAnnouncement(
            next,
            presetMinutes,
            prev.announcement
          ),
        }
      })
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [isRunning, presetMinutes])

  const toggleTimedMode = React.useCallback(() => {
    const nextEnabled = !isEnabled
    try {
      window.localStorage.setItem(
        TIMED_MODE_ENABLED_STORAGE_KEY,
        String(nextEnabled)
      )
      window.dispatchEvent(new Event(TIMED_MODE_CHANGE_EVENT))
    } catch {
      // Ignore storage failures
    }

    setTimerState({
      remaining: nextEnabled ? presetMinutes * 60 : null,
      announcement: nextEnabled
        ? `Timer started for ${presetMinutes} minutes`
        : "",
    })
  }, [isEnabled, presetMinutes])

  const setPreset = React.useCallback(
    (value: string): boolean => {
      if (value !== "5" && value !== "10" && value !== "15") {
        return false
      }
      const nextMinutes = Number(value) as TimerPresetMinutes
      try {
        window.localStorage.setItem(
          TIMED_MODE_MINUTES_STORAGE_KEY,
          String(nextMinutes)
        )
        window.dispatchEvent(new Event(TIMED_MODE_CHANGE_EVENT))
      } catch {
        // Ignore storage failures
      }

      setTimerState({
        remaining: nextMinutes * 60,
        announcement: isEnabled ? `Timer reset to ${nextMinutes} minutes` : "",
      })
      return true
    },
    [isEnabled]
  )

  const resetTimer = React.useCallback(() => {
    setTimerState({
      remaining: presetMinutes * 60,
      announcement: `Timer reset to ${presetMinutes} minutes`,
    })
  }, [presetMinutes])

  return {
    isEnabled,
    presetMinutes,
    displayedSeconds,
    announcement: timerState.announcement,
    isExpired: isEnabled && displayedSeconds === 0,
    isWarning: isEnabled && displayedSeconds > 0 && displayedSeconds < 60,
    toggleTimedMode,
    setPreset,
    resetTimer,
  }
}
