"use client"

import * as React from "react"
import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { Category, Difficulty, Language } from "@/types/challenge"

export interface FilterBarProps {
  difficulty: Difficulty | "All"
  onDifficultyChange: (difficulty: Difficulty | "All") => void
  category: Category | "All"
  onCategoryChange: (category: Category | "All") => void
  language: Language | "All"
  onLanguageChange: (language: Language | "All") => void
  search: string
  onSearchChange: (search: string) => void
  onReset: () => void
  totalCount?: number
  filteredCount?: number
}

const CATEGORIES: Array<{ label: string; value: Category | "All" }> = [
  { label: "All Categories", value: "All" },
  { label: "Agent Antipaths", value: "Agent Antipaths" },
  { label: "Security", value: "Security" },
  { label: "Concurrency", value: "Concurrency" },
  { label: "Performance", value: "Performance" },
]

const LANGUAGES: Array<{ label: string; value: Language | "All" }> = [
  { label: "All Languages", value: "All" },
  { label: "Python", value: "python" },
  { label: "TypeScript", value: "typescript" },
]

export function FilterBar({
  difficulty,
  onDifficultyChange,
  category,
  onCategoryChange,
  language,
  onLanguageChange,
  search,
  onSearchChange,
  onReset,
  totalCount,
  filteredCount,
}: FilterBarProps) {
  const handleClearSearch = () => {
    onSearchChange("")
  }

  const hasActiveFilters =
    difficulty !== "All" ||
    category !== "All" ||
    language !== "All" ||
    search.trim() !== ""

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <InputGroup className="flex-1">
          <InputGroupAddon align="inline-start">
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search challenges by title or keyword..."
            aria-label="Search challenges"
          />
          {search && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                onClick={handleClearSearch}
                aria-label="Clear search input"
              >
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>

        <Select
          value={category}
          onValueChange={(val) => onCategoryChange(val as Category | "All")}
        >
          <SelectTrigger
            className="w-full sm:w-48"
            aria-label="Filter by category"
          >
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select
          value={language}
          onValueChange={(val) => onLanguageChange(val as Language | "All")}
        >
          <SelectTrigger
            className="w-full sm:w-40"
            aria-label="Filter by language"
          >
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang.value} value={lang.value}>
                  {lang.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={2}
          value={difficulty}
          onValueChange={(val) => {
            if (val) {
              onDifficultyChange(val as Difficulty | "All")
            }
          }}
          aria-label="Filter by difficulty"
        >
          <ToggleGroupItem value="All">All</ToggleGroupItem>
          <ToggleGroupItem value="Easy">Easy</ToggleGroupItem>
          <ToggleGroupItem value="Medium">Medium</ToggleGroupItem>
          <ToggleGroupItem value="Hard">Hard</ToggleGroupItem>
        </ToggleGroup>

        <div className="flex items-center gap-2">
          {typeof filteredCount === "number" && (
            <span className="text-xs text-muted-foreground">
              Showing{" "}
              <span className="font-medium text-foreground">
                {filteredCount}
              </span>
              {typeof totalCount === "number" &&
              totalCount !== filteredCount ? (
                <span> of {totalCount}</span>
              ) : null}{" "}
              {filteredCount === 1 ? "challenge" : "challenges"}
            </span>
          )}

          {hasActiveFilters && (
            <Button variant="ghost" size="xs" onClick={onReset}>
              Reset filters
            </Button>
          )}
        </div>
      </div>

      <Separator />
    </div>
  )
}
