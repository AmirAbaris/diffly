"use client"

import * as React from "react"
import Link from "next/link"
import useSWR from "swr"
import { Sparkles, Terminal } from "lucide-react"
import { CatalogGrid } from "@/components/challenges/catalog-grid"
import { FilterBar } from "@/components/challenges/filter-bar"
import { Badge } from "@/components/ui/badge"
import { useChallenges } from "@/hooks/use-challenges"
import type { Category, Difficulty, Language } from "@/types/challenge"

interface HealthData {
  status: string
  service: string
}

export default function ChallengesPage() {
  const [difficulty, setDifficulty] = React.useState<Difficulty | "All">("All")
  const [category, setCategory] = React.useState<Category | "All">("All")
  const [language, setLanguage] = React.useState<Language | "All">("All")
  const [search, setSearch] = React.useState<string>("")

  // Fetch filtered challenges
  const { challenges, isLoading } = useChallenges({
    difficulty,
    category,
    language,
    search,
  })

  // Fetch total challenge count baseline
  const { challenges: allChallenges } = useChallenges()

  // Backend health status
  const { data: health, isLoading: isHealthLoading } =
    useSWR<HealthData>("/api/health")

  const handleResetFilters = React.useCallback(() => {
    setDifficulty("All")
    setCategory("All")
    setLanguage("All")
    setSearch("")
  }, [])

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      {/* Top Navigation Bar */}
      <header className="border-border/60 bg-background/80 sticky top-0 z-40 border-b backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/challenges"
              className="text-primary flex items-center gap-2 text-xl font-bold tracking-tight"
            >
              <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-xl">
                <Terminal className="size-4" />
              </div>
              <span>Diffly</span>
            </Link>
            <Badge variant="outline" className="hidden text-xs sm:inline-flex">
              Code Review Arena
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            {/* Backend health status badge */}
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <span className="hidden sm:inline">Backend:</span>
              {isHealthLoading ? (
                <Badge variant="outline" className="text-[10px]">
                  Checking...
                </Badge>
              ) : health?.status === "healthy" ? (
                <Badge
                  variant="secondary"
                  className="text-[10px] text-emerald-600 dark:text-emerald-400"
                >
                  Connected
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-[10px]">
                  Offline
                </Badge>
              )}
            </div>

            <div className="text-muted-foreground hidden items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[11px] lg:flex">
              <kbd className="bg-muted rounded px-1 text-[10px]">D</kbd>
              <span>toggle theme</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-8">
          {/* Hero Banner Header */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-foreground text-3xl font-extrabold tracking-tight sm:text-4xl">
                Challenge Catalog
              </h1>
              <Badge
                variant="secondary"
                className="gap-1 px-2.5 py-0.5 text-xs font-medium"
              >
                <Sparkles className="size-3 text-amber-500" />
                Curated PR Defects
              </Badge>
            </div>
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed sm:text-base">
              Sharpen your code review acumen by auditing real-world AI agent
              antipatterns, arbitrary execution vulnerabilities, and async race
              conditions in production diffs.
            </p>
          </div>

          {/* Interactive Filter Bar */}
          <FilterBar
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
            category={category}
            onCategoryChange={setCategory}
            language={language}
            onLanguageChange={setLanguage}
            search={search}
            onSearchChange={setSearch}
            onReset={handleResetFilters}
            totalCount={allChallenges.length}
            filteredCount={challenges.length}
          />

          {/* Catalog Challenge Grid */}
          <CatalogGrid
            challenges={challenges}
            isLoading={isLoading}
            onResetFilters={handleResetFilters}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-border/60 text-muted-foreground border-t py-6 text-xs">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6 lg:px-8">
          <p>
            © 2026 Diffly. LeetCode for Code Review on AI Agent Codes & Pull
            Requests.
          </p>
          <p className="font-mono text-[11px]">MVP v0.1.0</p>
        </div>
      </footer>
    </div>
  )
}
