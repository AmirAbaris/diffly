"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CatalogGrid } from "@/components/challenges/catalog-grid"
import { FilterBar } from "@/components/challenges/filter-bar"
import { useChallenges } from "@/hooks/use-challenges"
import type { Category, Difficulty, Language } from "@/types/challenge"

export function ChallengeCatalog() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const rawDifficulty = searchParams.get("difficulty")
  const rawCategory = searchParams.get("category")
  const rawLanguage = searchParams.get("language")
  const urlSearch = searchParams.get("search") ?? ""

  const difficulty: Difficulty | "All" =
    rawDifficulty === "Easy" ||
    rawDifficulty === "Medium" ||
    rawDifficulty === "Hard"
      ? rawDifficulty
      : "All"

  const category: Category | "All" =
    rawCategory === "Agent Antipaths" ||
    rawCategory === "Security" ||
    rawCategory === "Concurrency" ||
    rawCategory === "Performance"
      ? rawCategory
      : "All"

  const language: Language | "All" =
    rawLanguage === "python" || rawLanguage === "typescript"
      ? rawLanguage
      : "All"

  // Local state ensures typing is synchronous and never stomped by router updates
  const [search, setSearch] = React.useState<string>(urlSearch)
  const lastPushedSearchRef = React.useRef<string>(urlSearch)

  // Sync external URL changes (e.g. back/forward navigation or reset) without stomping active typing
  React.useEffect(() => {
    if (urlSearch !== lastPushedSearchRef.current) {
      lastPushedSearchRef.current = urlSearch
      setSearch(urlSearch)
    }
  }, [urlSearch])

  // Debounce search query syncing to URL
  React.useEffect(() => {
    const trimmed = search.trim()
    const currentUrl = searchParams.get("search") ?? ""

    if (trimmed === currentUrl) {
      return
    }

    const timer = setTimeout(() => {
      lastPushedSearchRef.current = trimmed

      const nextParams = new URLSearchParams(searchParams.toString())
      if (trimmed) {
        nextParams.set("search", trimmed)
      } else {
        nextParams.delete("search")
      }

      const queryString = nextParams.toString()
      const targetUrl = queryString ? `${pathname}?${queryString}` : pathname
      router.replace(targetUrl, { scroll: false })
    }, 250)

    return () => clearTimeout(timer)
  }, [search, searchParams, pathname, router])

  const updateFilters = React.useCallback(
    (updates: {
      difficulty?: Difficulty | "All"
      category?: Category | "All"
      language?: Language | "All"
    }) => {
      const nextParams = new URLSearchParams(searchParams.toString())

      const nextDifficulty =
        updates.difficulty !== undefined ? updates.difficulty : difficulty
      const nextCategory =
        updates.category !== undefined ? updates.category : category
      const nextLanguage =
        updates.language !== undefined ? updates.language : language

      if (nextDifficulty && nextDifficulty !== "All") {
        nextParams.set("difficulty", nextDifficulty)
      } else {
        nextParams.delete("difficulty")
      }

      if (nextCategory && nextCategory !== "All") {
        nextParams.set("category", nextCategory)
      } else {
        nextParams.delete("category")
      }

      if (nextLanguage && nextLanguage !== "All") {
        nextParams.set("language", nextLanguage)
      } else {
        nextParams.delete("language")
      }

      const trimmedSearch = search.trim()
      if (trimmedSearch) {
        nextParams.set("search", trimmedSearch)
      } else {
        nextParams.delete("search")
      }

      const queryString = nextParams.toString()
      const targetUrl = queryString ? `${pathname}?${queryString}` : pathname
      router.replace(targetUrl, { scroll: false })
    },
    [searchParams, difficulty, category, language, search, pathname, router]
  )

  const { challenges, totalCount, isLoading } = useChallenges({
    difficulty,
    category,
    language,
    search,
  })

  const handleResetFilters = React.useCallback(() => {
    setSearch("")
    lastPushedSearchRef.current = ""
    router.replace(pathname, { scroll: false })
  }, [router, pathname])

  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        difficulty={difficulty}
        onDifficultyChange={(val) => updateFilters({ difficulty: val })}
        category={category}
        onCategoryChange={(val) => updateFilters({ category: val })}
        language={language}
        onLanguageChange={(val) => updateFilters({ language: val })}
        search={search}
        onSearchChange={setSearch}
        onReset={handleResetFilters}
        totalCount={totalCount}
        filteredCount={challenges.length}
      />

      <CatalogGrid
        challenges={challenges}
        isLoading={isLoading}
        onResetFilters={handleResetFilters}
      />
    </div>
  )
}
