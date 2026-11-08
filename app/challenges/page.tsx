"use client"

import * as React from "react"
import Link from "next/link"
import useSWR from "swr"
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
      {/* Header */}
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/challenges"
            className="text-primary text-xl font-bold tracking-tight hover:opacity-90"
          >
            Diffly
          </Link>
          <Badge variant="outline" className="text-xs">
            Code Review Arena
          </Badge>
        </div>

        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <span>Backend:</span>
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
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">
              Challenge Catalog
            </h1>
            <p className="text-muted-foreground text-sm">
              Practice code reviews on AI agent antipatterns, security
              vulnerabilities, and concurrency defects.
            </p>
          </div>

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

          <CatalogGrid
            challenges={challenges}
            isLoading={isLoading}
            onResetFilters={handleResetFilters}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="text-muted-foreground border-t px-6 py-4 text-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span>Diffly — Code Review Arena</span>
          <span className="hidden sm:inline">
            Press &quot;D&quot; to toggle theme
          </span>
        </div>
      </footer>
    </div>
  )
}
