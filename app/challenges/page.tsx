"use client"

import * as React from "react"
import Link from "next/link"
import useSWR from "swr"
import { CatalogGrid } from "@/components/challenges/catalog-grid"
import { FilterBar } from "@/components/challenges/filter-bar"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
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

  const { challenges, isLoading } = useChallenges({
    difficulty,
    category,
    language,
    search,
  })

  const { challenges: allChallenges } = useChallenges()

  const { data: health, isLoading: isHealthLoading } =
    useSWR<HealthData>("/api/health")

  const handleResetFilters = React.useCallback(() => {
    setDifficulty("All")
    setCategory("All")
    setLanguage("All")
    setSearch("")
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/challenges"
            className="text-xl font-bold tracking-tight text-primary"
          >
            Diffly
          </Link>
          <Badge variant="outline">Code Review Arena</Badge>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Backend:</span>
          {isHealthLoading ? (
            <Badge variant="outline">Checking...</Badge>
          ) : health?.status === "healthy" ? (
            <Badge variant="secondary">Connected</Badge>
          ) : (
            <Badge variant="destructive">Offline</Badge>
          )}
        </div>
      </header>

      <Separator />

      <main className="flex-1 p-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight">
              Challenge Catalog
            </h1>
            <p className="text-sm text-muted-foreground">
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

      <Separator />

      <footer className="px-6 py-4 text-xs text-muted-foreground">
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
