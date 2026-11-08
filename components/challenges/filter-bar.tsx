"use client"

import * as React from "react"
import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
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
  const [prevSearch, setPrevSearch] = React.useState(search)
  const [searchInput, setSearchInput] = React.useState(search)

  if (search !== prevSearch) {
    setPrevSearch(search)
    setSearchInput(search)
  }

  // Debounce search input by 250ms
  React.useEffect(() => {
    if (searchInput === search) {
      return
    }

    const timer = setTimeout(() => {
      onSearchChange(searchInput)
    }, 250)

    return () => clearTimeout(timer)
  }, [searchInput, search, onSearchChange])

  const handleClearSearch = () => {
    setSearchInput("")
    onSearchChange("")
  }

  const hasActiveFilters =
    difficulty !== "All" ||
    category !== "All" ||
    language !== "All" ||
    search.trim() !== ""

  return (
    <div className="space-y-4">
      {/* Search & Select dropdowns */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search input with shadcn Input */}
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search challenges by keyword..."
            className="pr-8 pl-9"
            aria-label="Search challenges"
          />
          {searchInput && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={handleClearSearch}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
              aria-label="Clear search input"
            >
              <X className="size-3" />
            </Button>
          )}
        </div>

        {/* Category Select with shadcn Select */}
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
          <SelectContent>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Language Select with shadcn Select */}
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
          <SelectContent>
            {LANGUAGES.map((lang) => (
              <SelectItem key={lang.value} value={lang.value}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Difficulty chips & active filter status */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        {/* Difficulty chips using standard shadcn buttons */}
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="radiogroup"
          aria-label="Difficulty filter"
        >
          <span className="text-muted-foreground mr-1 text-xs">
            Difficulty:
          </span>

          <Button
            variant={difficulty === "All" ? "default" : "outline"}
            size="xs"
            role="radio"
            aria-checked={difficulty === "All"}
            onClick={() => onDifficultyChange("All")}
          >
            All
          </Button>

          <Button
            variant={difficulty === "Easy" ? "secondary" : "outline"}
            size="xs"
            role="radio"
            aria-checked={difficulty === "Easy"}
            onClick={() => onDifficultyChange("Easy")}
            className={cn(
              difficulty === "Easy" &&
                "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            )}
          >
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Easy
          </Button>

          <Button
            variant={difficulty === "Medium" ? "secondary" : "outline"}
            size="xs"
            role="radio"
            aria-checked={difficulty === "Medium"}
            onClick={() => onDifficultyChange("Medium")}
            className={cn(
              difficulty === "Medium" &&
                "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            )}
          >
            <span className="size-1.5 rounded-full bg-amber-500" />
            Medium
          </Button>

          <Button
            variant={difficulty === "Hard" ? "secondary" : "outline"}
            size="xs"
            role="radio"
            aria-checked={difficulty === "Hard"}
            onClick={() => onDifficultyChange("Hard")}
            className={cn(
              difficulty === "Hard" &&
                "border-destructive/40 bg-destructive/10 text-destructive"
            )}
          >
            <span className="size-1.5 rounded-full bg-rose-500" />
            Hard
          </Button>
        </div>

        {/* Counter & Reset */}
        <div className="flex items-center gap-2">
          {typeof filteredCount === "number" && (
            <span className="text-muted-foreground text-xs">
              Showing{" "}
              <span className="text-foreground font-medium">
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
            <Button
              variant="ghost"
              size="xs"
              onClick={onReset}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Reset filters
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
