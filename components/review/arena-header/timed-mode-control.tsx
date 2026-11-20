"use client"

import * as React from "react"
import { ChevronDown, RotateCcw, Timer } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  TIMED_MODE_ENABLED_STORAGE_KEY,
  TIMED_MODE_MINUTES_STORAGE_KEY,
} from "@/lib/storage-keys"
import { cn } from "@/lib/utils"

export type TimerPresetMinutes = 5 | 10 | 15

const TIMER_PRESETS: readonly TimerPresetMinutes[] = [5, 10, 15]
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

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
}

export function TimedModeControl() {
  const isEnabled = React.useSyncExternalStore(
    subscribeTimedMode,
    readStoredEnabled,
    () => false
  )
  const presetMinutes = React.useSyncExternalStore(
    subscribeTimedMode,
    readStoredMinutes,
    () => 10
  )

  const [isPresetOpen, setIsPresetOpen] = React.useState(false)
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
        let nextAnnouncement = prev.announcement
        if (next === 0) {
          nextAnnouncement = "Time's up"
        } else if (next === 30) {
          nextAnnouncement = "30 seconds remaining"
        } else if (next === 60) {
          nextAnnouncement = "1 minute remaining"
        } else if (next === 300 && presetMinutes > 5) {
          nextAnnouncement = "5 minutes remaining"
        }
        return {
          remaining: next,
          announcement: nextAnnouncement,
        }
      })
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [isRunning, presetMinutes])

  const handleToggle = () => {
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
  }

  const handlePresetChange = (value: string) => {
    if (value !== "5" && value !== "10" && value !== "15") {
      return
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
    setIsPresetOpen(false)
  }

  const handleReset = () => {
    setTimerState({
      remaining: presetMinutes * 60,
      announcement: `Timer reset to ${presetMinutes} minutes`,
    })
  }

  const isExpired = isEnabled && displayedSeconds === 0
  const isWarning = isEnabled && displayedSeconds > 0 && displayedSeconds < 60

  return (
    <div data-testid="timed-mode-control" className="flex items-center gap-1">
      <span
        aria-live="polite"
        data-testid="timed-mode-live-region"
        className="sr-only"
      >
        {timerState.announcement}
      </span>

      <Button
        type="button"
        variant={isEnabled ? "secondary" : "outline"}
        size="sm"
        aria-pressed={isEnabled}
        aria-label={isEnabled ? "Disable timed mode" : "Enable timed mode"}
        data-testid="timed-mode-toggle"
        onClick={handleToggle}
        className="h-8 gap-1 px-2 text-xs sm:px-2.5"
      >
        <Timer aria-hidden="true" className="size-3.5" />
        {!isEnabled && <span className="hidden sm:inline">Timed</span>}
      </Button>

      {isEnabled && (
        <div
          data-testid="timed-mode-countdown"
          data-state={isExpired ? "expired" : isWarning ? "warning" : "normal"}
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-md border px-2 font-mono text-xs font-medium tabular-nums transition-colors",
            isExpired
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : isWarning
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : "border-border bg-muted/30 text-foreground"
          )}
        >
          <span>{formatCountdown(displayedSeconds)}</span>
          {isExpired && (
            <span className="hidden sm:inline">Time&apos;s up</span>
          )}
        </div>
      )}

      <Popover open={isPresetOpen} onOpenChange={setIsPresetOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Timer duration ${presetMinutes} minutes`}
            data-testid="timed-preset-trigger"
            className="inline-flex h-8 gap-0.5 px-1 font-mono text-xs text-muted-foreground tabular-nums hover:text-foreground sm:px-1.5"
          >
            <span className="hidden sm:inline">{presetMinutes}m</span>
            <ChevronDown aria-hidden="true" className="size-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-2">
          <div className="flex items-center gap-1.5">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={String(presetMinutes)}
              onValueChange={handlePresetChange}
              aria-label="Timed mode preset duration"
              data-testid="timed-mode-presets"
            >
              {TIMER_PRESETS.map((minutes) => (
                <ToggleGroupItem
                  key={minutes}
                  value={String(minutes)}
                  data-testid={`timed-preset-${minutes}`}
                  className="h-7 px-2 font-mono text-xs tabular-nums"
                >
                  {minutes}m
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            {isEnabled && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={handleReset}
                aria-label="Reset timer"
                data-testid="timed-mode-reset"
              >
                <RotateCcw aria-hidden="true" className="size-3" />
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
