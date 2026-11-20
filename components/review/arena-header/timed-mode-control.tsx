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
  TIMER_PRESETS,
  formatCountdown,
  useTimedMode,
  type TimerPresetMinutes,
} from "@/hooks/use-timed-mode"
import { cn } from "@/lib/utils"

export type { TimerPresetMinutes }

function getCountdownClassName(isExpired: boolean, isWarning: boolean): string {
  if (isExpired) {
    return "border-destructive/40 bg-destructive/10 text-destructive"
  }
  if (isWarning) {
    return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
  }
  return "border-border bg-muted/30 text-foreground"
}

export function TimedModeControl() {
  const [isPresetOpen, setIsPresetOpen] = React.useState(false)
  const {
    isEnabled,
    presetMinutes,
    displayedSeconds,
    announcement,
    isExpired,
    isWarning,
    toggleTimedMode,
    setPreset,
    resetTimer,
  } = useTimedMode()

  const handlePresetChange = (value: string) => {
    if (setPreset(value)) {
      setIsPresetOpen(false)
    }
  }

  const countdownState = isExpired
    ? "expired"
    : isWarning
      ? "warning"
      : "normal"

  return (
    <div data-testid="timed-mode-control" className="flex items-center gap-1">
      <span
        aria-live="polite"
        data-testid="timed-mode-live-region"
        className="sr-only"
      >
        {announcement}
      </span>

      <Button
        type="button"
        variant={isEnabled ? "secondary" : "outline"}
        size="sm"
        aria-pressed={isEnabled}
        aria-label={isEnabled ? "Disable timed mode" : "Enable timed mode"}
        data-testid="timed-mode-toggle"
        onClick={toggleTimedMode}
        className="h-8 gap-1 px-2 text-xs sm:px-2.5"
      >
        <Timer aria-hidden="true" className="size-3.5" />
        {!isEnabled && <span className="hidden sm:inline">Timed</span>}
      </Button>

      {isEnabled && (
        <div
          data-testid="timed-mode-countdown"
          data-state={countdownState}
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-md border px-2 font-mono text-xs font-medium tabular-nums transition-colors",
            getCountdownClassName(isExpired, isWarning)
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
                onClick={resetTimer}
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
