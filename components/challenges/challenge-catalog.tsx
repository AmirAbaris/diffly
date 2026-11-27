"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AlertCircle } from "lucide-react"
import { CatalogGrid } from "@/components/challenges/catalog-grid"
import { CatalogPagination } from "@/components/challenges/catalog-pagination"
import { FilterBar } from "@/components/challenges/filter-bar"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  DEFAULT_CATALOG_PAGE_SIZE,
  useChallenges,
} from "@/hooks/use-challenges"
import { isSupportedLanguage } from "@/lib/languages/registry"
import type { Category, Difficulty, Language } from "@/types/challenge"

const VALID_DIFFICULTIES = new Set<Difficulty>(["Easy", "Medium", "Hard"])
const VALID_CATEGORIES = new Set<Category>([
  "Agent Antipaths",
  "Security",
  "Concurrency",
  "Performance",
  "Logic Flaws",
])

interface ParsedCatalogParams {
  difficulty: Difficulty | "All"
  category: Category | "All"
  language: Language | "All"
  urlSearch: string
  page: number
}

function parsePageParam(raw: string | null): number {
  if (!raw) return 1
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
}

function parseCatalogSearchParams(
  searchParams: Pick<URLSearchParams, "get">
): ParsedCatalogParams {
  const rawDifficulty = searchParams.get("difficulty") as Difficulty | null
  const rawCategory = searchParams.get("category") as Category | null
  const rawLanguage = searchParams.get("language")

  return {
    difficulty:
      rawDifficulty && VALID_DIFFICULTIES.has(rawDifficulty)
        ? rawDifficulty
        : "All",
    category:
      rawCategory && VALID_CATEGORIES.has(rawCategory) ? rawCategory : "All",
    language: isSupportedLanguage(rawLanguage) ? rawLanguage : "All",
    urlSearch: searchParams.get("search") ?? "",
    page: parsePageParam(searchParams.get("page")),
  }
}

function setOrDeleteParam(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
  defaultValue = "All"
): void {
  if (value && value !== defaultValue) {
    params.set(key, value)
  } else {
    params.delete(key)
  }
}

function buildCatalogTargetUrl(
  pathname: string,
  currentQuery: string,
  nextValues: {
    difficulty: Difficulty | "All"
    category: Category | "All"
    language: Language | "All"
    search: string
    page: number
  }
): string {
  const nextParams = new URLSearchParams(currentQuery)
  setOrDeleteParam(nextParams, "difficulty", nextValues.difficulty)
  setOrDeleteParam(nextParams, "category", nextValues.category)
  setOrDeleteParam(nextParams, "language", nextValues.language)
  setOrDeleteParam(nextParams, "search", nextValues.search.trim(), "")
  setOrDeleteParam(
    nextParams,
    "page",
    nextValues.page > 1 ? String(nextValues.page) : undefined,
    ""
  )
  const queryString = nextParams.toString()
  return queryString ? `${pathname}?${queryString}` : pathname
}

function CatalogErrorState({
  onRetry,
  onReset,
}: {
  onRetry: () => void
  onReset: () => void
}) {
  return (
    <Empty data-testid="catalog-error-state" className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AlertCircle aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>Failed to load challenges</EmptyTitle>
        <EmptyDescription>
          Unable to fetch the challenge catalog for your active filters. Please
          retry or reset your filters.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex items-center gap-2">
          <Button variant="default" size="sm" onClick={onRetry}>
            Retry
          </Button>
          <Button variant="outline" size="sm" onClick={onReset}>
            Reset filters
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  )
}

export function ChallengeCatalog() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const { difficulty, category, language, urlSearch, page } =
    parseCatalogSearchParams(searchParams)

  const [searchOverride, setSearchOverride] = React.useState<{
    baseUrlSearch: string
    value: string
  } | null>(null)

  const search =
    searchOverride && searchOverride.baseUrlSearch === urlSearch
      ? searchOverride.value
      : urlSearch

  const handleSearchChange = React.useCallback(
    (nextValue: string) => {
      setSearchOverride({ baseUrlSearch: urlSearch, value: nextValue })
    },
    [urlSearch]
  )

  React.useEffect(() => {
    const trimmed = search.trim()
    if (trimmed === urlSearch.trim()) {
      return
    }

    const timer = setTimeout(() => {
      const targetUrl = buildCatalogTargetUrl(
        pathname,
        searchParams.toString(),
        {
          difficulty,
          category,
          language,
          search: trimmed,
          page: 1,
        }
      )
      router.replace(targetUrl, { scroll: false })
    }, 250)

    return () => clearTimeout(timer)
  }, [
    search,
    urlSearch,
    searchParams,
    pathname,
    router,
    difficulty,
    category,
    language,
  ])

  const [clampedTotalPages, setClampedTotalPages] = React.useState<
    number | null
  >(null)

  const effectivePage =
    clampedTotalPages !== null && page > clampedTotalPages
      ? clampedTotalPages
      : page

  const { challenges, totalCount, totalPages, isLoading, error, mutate } =
    useChallenges({
      difficulty,
      category,
      language,
      search: urlSearch.trim(),
      page: effectivePage,
      limit: DEFAULT_CATALOG_PAGE_SIZE,
    })

  if (
    !isLoading &&
    !error &&
    totalCount > 0 &&
    clampedTotalPages !== totalPages
  ) {
    setClampedTotalPages(totalPages)
  }

  const updateFilters = React.useCallback(
    (updates: {
      difficulty?: Difficulty | "All"
      category?: Category | "All"
      language?: Language | "All"
      page?: number
    }) => {
      const isFilterChange =
        updates.difficulty !== undefined ||
        updates.category !== undefined ||
        updates.language !== undefined
      const trimmedSearch = search.trim()
      setSearchOverride({ baseUrlSearch: trimmedSearch, value: search })

      const targetUrl = buildCatalogTargetUrl(
        pathname,
        searchParams.toString(),
        {
          difficulty: updates.difficulty ?? difficulty,
          category: updates.category ?? category,
          language: updates.language ?? language,
          search: trimmedSearch,
          page: isFilterChange ? 1 : (updates.page ?? effectivePage),
        }
      )
      router.replace(targetUrl, { scroll: false })
    },
    [
      pathname,
      searchParams,
      difficulty,
      category,
      language,
      search,
      effectivePage,
      router,
    ]
  )

  const handleResetFilters = React.useCallback(() => {
    setSearchOverride(null)
    router.replace(pathname, { scroll: false })
  }, [router, pathname])

  const safePage = Math.min(Math.max(1, effectivePage), totalPages)

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
        onSearchChange={handleSearchChange}
        onReset={handleResetFilters}
        totalCount={error ? undefined : totalCount}
        filteredCount={error ? undefined : challenges.length}
      />

      {error && !isLoading ? (
        <CatalogErrorState
          onRetry={() => {
            void mutate()
          }}
          onReset={handleResetFilters}
        />
      ) : (
        <>
          <CatalogGrid
            challenges={challenges}
            isLoading={isLoading}
            onResetFilters={handleResetFilters}
          />

          <CatalogPagination
            page={safePage}
            totalPages={totalPages}
            onPageChange={(nextPage) => updateFilters({ page: nextPage })}
          />
        </>
      )}
    </div>
  )
}
