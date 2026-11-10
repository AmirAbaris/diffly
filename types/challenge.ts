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

export interface DetectedIssue {
  id: string
  title: string
  severity: string
  matched_lines?: number[]
  matched_keywords?: string[]
  line_score?: number
  concept_score?: number
  explanation?: string
  [key: string]: unknown
}

export interface MissedIssue {
  id: string
  title: string
  severity: string
  expected_lines?: number[]
  missing_keywords?: string[]
  explanation?: string
  [key: string]: unknown
}

export interface ReviewSubmissionResponse {
  submission_id: number
  id: number
  score: number
  feedback: string
  detected_issues: DetectedIssue[]
  missed_issues: MissedIssue[]
  created_at: string
  flagged_lines?: number[]
  comments?: string
}

export interface SubmissionHistoryItem {
  attempt_number: number
  id: number
  submission_id: number
  challenge_id: number
  flagged_lines: number[]
  comments: string
  score: number
  feedback: string
  detected_issues: DetectedIssue[]
  missed_issues: MissedIssue[]
  created_at: string
}

export interface ChallengeSolutionResponse {
  id: number
  challenge_id: number
  slug: string
  canonical_review: string
  recommended_fix_diff: string
  expected_issues?: Array<{
    id: string
    title: string
    severity: string
    lines: number[]
    keywords: string[]
    explanation: string
  }>
}

export interface CategoryProgress {
  category: string
  solved: number
  total: number
  accuracy: number
}

export interface UserProgress {
  total_challenges: number
  total_attempted: number
  total_solved: number
  average_score: number
  streak_days: number
  categories_breakdown: CategoryProgress[]
}

export interface ClaimSessionRequest {
  session_id?: string | null
}

export interface ClaimSessionResponse {
  claimed_count: number
  user_id: number
  session_id: string
}
