export type Difficulty = "Easy" | "Medium" | "Hard"

export type Category =
  "Agent Antipaths" | "Security" | "Concurrency" | "Performance"

export type Language = "python" | "typescript"

export interface ChallengeSummary {
  id: number
  slug: string
  title: string
  difficulty: Difficulty
  category: Category
  language: Language
  description: string
  estimated_minutes: number
  line_count: number
  total_hints: number
  is_solved: boolean
  best_score: number | null
}

export interface ChallengeDetail extends ChallengeSummary {
  threat_model: string
  defect_target: string
  code_snippet: string
}

export interface ChallengeFilters {
  difficulty?: Difficulty | "All"
  category?: Category | "All"
  language?: Language | "All"
  search?: string
}
