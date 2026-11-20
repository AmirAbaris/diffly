"use client"

import * as React from "react"
import { Globe, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTimezonePreference } from "@/hooks/use-timezone-preference"
import { toast } from "@/hooks/use-toast"
import { mutateUserStats } from "@/hooks/use-user-stats"

export function SettingsTimezoneCard() {
  const {
    timezone,
    detectedTimezone,
    isAuto,
    availableTimezones,
    setTimezonePreference,
    resetTimezonePreference,
  } = useTimezonePreference()

  const handleTimezoneChange = (value: string) => {
    if (value === "auto") {
      resetTimezonePreference()
    } else {
      setTimezonePreference(value)
    }
    void mutateUserStats()
    toast({
      title: "Timezone updated",
      description:
        value === "auto"
          ? `Using browser timezone (${detectedTimezone}).`
          : `Analytics and streak calculations now use ${value}.`,
      variant: "success",
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe aria-hidden="true" className="size-4 text-muted-foreground" />
          <span>Timezone Preference</span>
        </CardTitle>
        <CardDescription className="text-xs">
          Controls local day boundaries for your streak counter and activity
          heatmap. Detected browser timezone:{" "}
          <span className="font-mono text-foreground">{detectedTimezone}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full max-w-sm">
          <Select
            value={isAuto ? "auto" : timezone}
            onValueChange={handleTimezoneChange}
          >
            <SelectTrigger
              aria-label="Timezone preference"
              data-testid="timezone-select-trigger"
              className="w-full"
            >
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">
                Auto-detect ({detectedTimezone})
              </SelectItem>
              {availableTimezones.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!isAuto && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleTimezoneChange("auto")}
            data-testid="timezone-reset-button"
          >
            <RotateCcw data-icon="inline-start" aria-hidden="true" />
            <span>Reset to auto</span>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
