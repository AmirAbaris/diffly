import type {
  Category,
  ChallengeSummary,
  UserProgress,
} from "@/types/challenge"

export type AnalyticsWindowDays = 30 | 90 | 365

export interface ActivityDay {
  date: string
  count: number
}

export interface CategoryMastery {
  category: Category | string
  total: number
  attempted: number
  solved: number
  mastery: number
  precision: number
  recall: number
}

export interface AnalyticsTrendPoint {
  date: string
  submissions: number
  precision: number
  recall: number
  average_score: number
}

export interface CustomChallengeAnalytics {
  attempted: number
  solved: number
  submissions: number
}

export interface UserAnalytics {
  timezone: string
  days: number
  streak_days: number
  longest_streak_days: number
  total_submissions: number
  activity: ActivityDay[]
  category_mastery: CategoryMastery[]
  trends: AnalyticsTrendPoint[]
  custom: CustomChallengeAnalytics
}

export interface UserProgressExtended extends UserProgress {
  timezone?: string
  custom_attempted?: number
  custom_solved?: number
}

export type NextChallengeReason =
  "due_review" | "weak_category" | "new_material" | "refresh"

export interface NextChallengeResponse {
  challenge: ChallengeSummary
  reason: NextChallengeReason
  due_at: string | null
  category_mastery: number
  review_interval_days: number | null
}

export interface AuthProvidersResponse {
  github: boolean
}
