import type { Category } from "@/types/challenge"

export type LeaderboardWindow = "all" | "30d" | "7d"

export interface LeaderboardEntry {
  rank: number
  username: string
  points: number
  challenges_solved: number
  hard_solved: number
  average_score: number
  is_current_user: boolean
}

export interface CurrentUserRank {
  rank: number | null
  username: string
  points: number
  challenges_solved: number
  hard_solved: number
  average_score: number
  percentile: number | null
  hidden: boolean
}

export interface LeaderboardResponse {
  window: LeaderboardWindow
  category: Category | null
  limit: number
  offset: number
  total_entries: number
  total_catalog_challenges: number
  entries: LeaderboardEntry[]
  current_user: CurrentUserRank | null
}

export interface LeaderboardFilters {
  window: LeaderboardWindow
  category: Category | null
  page: number
  limit: number
}

export const DEFAULT_LEADERBOARD_PAGE_SIZE = 25

export const LEADERBOARD_WINDOWS: readonly LeaderboardWindow[] = [
  "all",
  "30d",
  "7d",
] as const

export const LEADERBOARD_WINDOW_LABELS: Record<LeaderboardWindow, string> = {
  all: "All Time",
  "30d": "30 Days",
  "7d": "7 Days",
}

export const LEADERBOARD_CATEGORIES: readonly Category[] = [
  "Agent Antipaths",
  "Security",
  "Concurrency",
  "Performance",
  "Logic Flaws",
] as const
