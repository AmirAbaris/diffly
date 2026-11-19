export const MIN_REVIEW_COMMENT_CHARS = 5

export interface ReviewValidationResult {
  hasLines: boolean
  hasMinComment: boolean
  trimmedLength: number
  remainingChars: number
  canSubmit: boolean
}

export function validateReviewSubmission(
  flaggedLines: number[],
  comments: string,
  minCharacters: number = MIN_REVIEW_COMMENT_CHARS
): ReviewValidationResult {
  const trimmedLength = comments.trim().length
  const hasLines = flaggedLines.length > 0
  const hasMinComment = trimmedLength >= minCharacters
  const remainingChars = Math.max(0, minCharacters - trimmedLength)

  return {
    hasLines,
    hasMinComment,
    trimmedLength,
    remainingChars,
    canSubmit: hasLines && hasMinComment,
  }
}
