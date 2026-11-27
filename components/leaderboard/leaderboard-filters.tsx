"use client"

import * as React from "react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { Category } from "@/types/challenge"
import {
  LEADERBOARD_CATEGORIES,
  LEADERBOARD_WINDOWS,
  LEADERBOARD_WINDOW_LABELS,
  type LeaderboardWindow,
} from "@/types/leaderboard"

export interface LeaderboardFiltersBarProps {
  window: LeaderboardWindow
  category: Category | null
  onWindowChange: (window: LeaderboardWindow) => void
  onCategoryChange: (category: Category | null) => void
}

const ALL_CATEGORIES_VALUE = "__all__"

export function LeaderboardFiltersBar({
  window,
  category,
  onWindowChange,
  onCategoryChange,
}: LeaderboardFiltersBarProps) {
  const handleWindowChange = (value: string) => {
    if (value) {
      onWindowChange(value as LeaderboardWindow)
    }
  }

  const handleCategoryChange = (value: string) => {
    onCategoryChange(
      value === ALL_CATEGORIES_VALUE ? null : (value as Category)
    )
  }

  return (
    <div
      data-testid="leaderboard-filters"
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={window}
        onValueChange={handleWindowChange}
        aria-label="Leaderboard timeframe"
        data-testid="leaderboard-window-toggle"
      >
        {LEADERBOARD_WINDOWS.map((option) => (
          <ToggleGroupItem
            key={option}
            value={option}
            data-testid={`leaderboard-window-${option}`}
            className="text-xs"
          >
            {LEADERBOARD_WINDOW_LABELS[option]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Select
        value={category ?? ALL_CATEGORIES_VALUE}
        onValueChange={handleCategoryChange}
      >
        <SelectTrigger
          size="sm"
          aria-label="Filter leaderboard by category"
          data-testid="leaderboard-category-select"
          className="w-full sm:w-52"
        >
          <SelectValue placeholder="All Categories" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            <SelectItem value={ALL_CATEGORIES_VALUE}>All Categories</SelectItem>
            {LEADERBOARD_CATEGORIES.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
