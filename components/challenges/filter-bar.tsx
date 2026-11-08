"use client"

import * as React from "react"
import {
  ChevronDown,
  Code2,
  Filter,
  Layers,
  RotateCcw,
  Search,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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

const DIFFICULTIES: Array<{
  label: string
  value: Difficulty | "All"
  activeClass: string
  inactiveClass: string
  dotClass?: string
}> = [
  {
    label: "All",
    value: "All",
    activeClass: "bg-primary text-primary-foreground shadow-xs font-semibold",
    inactiveClass:
      "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
  },
  {
    label: "Easy",
    value: "Easy",
    activeClass:
      "bg-emerald-600 text-white dark:bg-emerald-700 shadow-xs border-emerald-600 font-semibold",
    inactiveClass:
      "border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10",
    dotClass: "bg-emerald-500",
  },
  {
    label: "Medium",
    value: "Medium",
    activeClass:
      "bg-amber-600 text-white dark:bg-amber-700 shadow-xs border-amber-600 font-semibold",
    inactiveClass:
      "border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10",
    dotClass: "bg-amber-500",
  },
  {
    label: "Hard",
    value: "Hard",
    activeClass:
      "bg-rose-600 text-white dark:bg-rose-700 shadow-xs border-rose-600 font-semibold",
    inactiveClass:
      "border-rose-500/30 text-rose-700 dark:text-rose-400 hover:bg-rose-500/10",
    dotClass: "bg-rose-500",
  },
]

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

  // Sync state during render if parent resets or changes search prop
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
      {/* Search and Dropdowns Row */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Debounced Search Input (250ms) */}
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search challenges by title, keyword, or slug..."
            className="border-input bg-card/60 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/30 h-10 w-full rounded-xl border pr-10 pl-10 text-sm transition-colors focus-visible:ring-3 focus-visible:outline-none"
            aria-label="Search challenges"
          />
          {searchInput && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 p-1"
              aria-label="Clear search input"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          {/* Category Filter Dropdown */}
          <div className="relative min-w-[170px] flex-1 sm:w-48 sm:flex-initial">
            <Layers className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <select
              value={category}
              onChange={(e) =>
                onCategoryChange(e.target.value as Category | "All")
              }
              aria-label="Filter by category"
              className="border-input bg-card/60 text-foreground focus-visible:border-ring focus-visible:ring-ring/30 hover:bg-accent/40 h-10 w-full appearance-none rounded-xl border pr-8 pl-9 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:outline-none"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
            <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2" />
          </div>

          {/* Language Filter Dropdown / Selector */}
          <div className="relative min-w-[150px] flex-1 sm:w-44 sm:flex-initial">
            <Code2 className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <select
              value={language}
              onChange={(e) =>
                onLanguageChange(e.target.value as Language | "All")
              }
              aria-label="Filter by language"
              className="border-input bg-card/60 text-foreground focus-visible:border-ring focus-visible:ring-ring/30 hover:bg-accent/40 h-10 w-full appearance-none rounded-xl border pr-8 pl-9 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:outline-none"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
            <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2" />
          </div>

          {/* Reset Filters Button */}
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="default"
              onClick={onReset}
              className="text-muted-foreground hover:text-foreground h-10 rounded-xl px-3 text-xs"
              title="Reset all filters"
            >
              <RotateCcw className="size-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </Button>
          )}
        </div>
      </div>

      {/* Difficulty Chips and Filter Summary Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        {/* Difficulty Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
            <Filter className="size-3" /> Difficulty:
          </span>
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="radiogroup"
            aria-label="Difficulty level"
          >
            {DIFFICULTIES.map((d) => {
              const isSelected = difficulty === d.value
              return (
                <button
                  key={d.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onDifficultyChange(d.value)}
                  className={cn(
                    "focus-visible:ring-ring inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-all select-none focus-visible:ring-2 focus-visible:outline-none",
                    isSelected ? d.activeClass : d.inactiveClass
                  )}
                >
                  {d.dotClass && !isSelected && (
                    <span className={cn("size-1.5 rounded-full", d.dotClass)} />
                  )}
                  {d.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Counter and Active Filter Tags */}
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          {typeof filteredCount === "number" && (
            <span>
              Showing{" "}
              <strong className="text-foreground">{filteredCount}</strong>
              {typeof totalCount === "number" &&
              totalCount !== filteredCount ? (
                <span> of {totalCount}</span>
              ) : null}{" "}
              {filteredCount === 1 ? "challenge" : "challenges"}
            </span>
          )}
          {hasActiveFilters && (
            <Badge variant="secondary" className="text-[10px]">
              Filtered
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}
