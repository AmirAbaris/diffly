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

export interface ChallengeHint {
  tier: number
  label: string
  text: string
}

export interface ChallengeFilters {
  difficulty?: Difficulty | "All"
  category?: Category | "All"
  language?: Language | "All"
  search?: string
}

export interface ReviewDraft {
  flaggedLines: number[]
  comments: string
  updatedAt?: string
}

export interface ReviewSubmissionRequest {
  flagged_lines: number[]
  comments: string
  session_id?: string | null
}

export interface ReviewSubmissionResponse {
  submission_id: number
  id: number
  score: number
  feedback: string
  detected_issues: Array<Record<string, unknown>>
  missed_issues: Array<Record<string, unknown>>
  created_at: string
}
