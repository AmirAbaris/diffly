export type Difficulty = "Easy" | "Medium" | "Hard"

export type Category =
  "Agent Antipaths" | "Security" | "Concurrency" | "Performance" | "Logic Flaws"

export const CHALLENGE_LANGUAGE_IDS = [
  "python",
  "typescript",
  "go",
  "rust",
  "java",
  "csharp",
] as const

export type Language = (typeof CHALLENGE_LANGUAGE_IDS)[number]

export const CHALLENGE_DIFFICULTIES: readonly Difficulty[] = [
  "Easy",
  "Medium",
  "Hard",
] as const

export {
  CHALLENGE_LANGUAGES,
  formatLanguageLabel,
} from "@/lib/languages/registry"

export interface ChallengeFile {
  path: string
  language: string
  content?: string | null
  patch?: string | null
}

export interface FlaggedLineRef {
  file_path: string
  line_number: number
}

export type FlaggedLine = number | FlaggedLineRef

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
  file_count?: number
  total_hints: number
  is_solved: boolean
  best_score: number | null
  is_public?: boolean
  is_shared?: boolean
  share_token?: string | null
}

export interface ChallengeDetail extends ChallengeSummary {
  threat_model: string
  defect_target: string
  code_snippet: string
  files?: ChallengeFile[]
  is_owner?: boolean
}

export interface ShareChallengeResponse {
  id: number
  slug: string
  is_shared: boolean
  share_token: string | null
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
  page?: number
  limit?: number
}

export type FindingSeverity = "critical" | "high" | "medium" | "low"

export interface ReviewFindingPayload {
  id: string
  file_path: string | null
  start_line: number
  end_line: number
  body: string
  severity: FindingSeverity | null
}

export interface ReviewFindingAnchorPayload {
  file_path: string | null
  start_line: number
  end_line: number
}

export interface ReviewFindingResponsePayload {
  id: string
  anchor: ReviewFindingAnchorPayload
  body: string
  severity: FindingSeverity | null
}

export type ReviewFindingWirePayload =
  ReviewFindingPayload | ReviewFindingResponsePayload

export interface FindingVerdictPayload {
  finding_id: string
  verdict: "matched" | "redundant" | "false_positive"
  defect_id?: string | null
  line_score: number
  severity_agrees?: boolean | null
}

export interface ReviewDraft {
  flaggedLines: FlaggedLine[]
  comments: string
  updatedAt?: string
}

export interface ReviewSubmissionRequest {
  findings?: ReviewFindingPayload[]
  flagged_lines?: FlaggedLine[]
  comments: string
  reveal?: boolean
}

export interface DetectedIssue {
  id: string
  title: string
  severity: string
  matched_lines?: FlaggedLine[]
  matched_keywords?: string[]
  finding_ids?: string[]
  line_score?: number
  concept_score?: number
  explanation?: string
  [key: string]: unknown
}

export interface MissedIssue {
  id: string
  title: string
  severity: string
  expected_lines?: FlaggedLine[]
  missing_keywords?: string[]
  explanation?: string
  [key: string]: unknown
}

export interface ReviewSubmissionResponse {
  submission_id: number
  id: number
  score: number
  line_precision_score?: number
  concept_score?: number
  false_positive_penalty?: number
  false_positive_lines?: FlaggedLine[]
  summary?: string
  feedback: string
  detected_issues: DetectedIssue[]
  missed_issues: MissedIssue[]
  created_at: string
  flagged_lines?: FlaggedLine[]
  comments?: string
  findings?: ReviewFindingWirePayload[]
  finding_verdicts?: FindingVerdictPayload[]
}

export interface SubmissionHistoryItem {
  attempt_number: number
  id: number
  submission_id: number
  challenge_id: number
  flagged_lines: FlaggedLine[]
  comments: string
  score: number
  line_precision_score?: number
  concept_score?: number
  false_positive_penalty?: number
  false_positive_lines?: FlaggedLine[]
  summary?: string
  feedback: string
  detected_issues: DetectedIssue[]
  missed_issues: MissedIssue[]
  created_at: string
  findings?: ReviewFindingWirePayload[]
  finding_verdicts?: FindingVerdictPayload[]
}

export interface ChallengeExpectedIssue {
  id: string
  title: string
  severity: string
  file_path?: string | null
  lines: FlaggedLine[]
  matched_lines?: FlaggedLine[]
  keywords: string[]
  explanation: string
}

export interface ChallengeSolutionResponse {
  id: number
  challenge_id: number
  slug: string
  canonical_review: string
  recommended_fix_diff: string
  expected_issues?: ChallengeExpectedIssue[]
}

export interface CustomChallengesListResponse {
  items: ChallengeSummary[]
  total: number
  quota_limit: number
  quota_remaining: number
}

export interface GenerateCustomChallengePayload {
  topic: string
  language: Language
  difficulty: Difficulty
}

export interface CustomChallengeResponse extends ChallengeDetail {
  is_custom?: boolean
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
