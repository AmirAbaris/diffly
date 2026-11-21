export {
  MAX_ANCHOR_SPAN,
  SEVERITIES,
  asFindingId,
  compareFileKeys,
  compareFindings,
  createFindingId,
  expandFlaggedLines,
  findingAt,
  formatAnchor,
  isSameLineRef,
  lineRefKey,
  toLineRef,
  type Anchor,
  type Finding,
  type FindingId,
  type LineRef,
  type ReviewDraft,
  type Severity,
} from "./model"

export { parsePatchSelectableLines } from "./patch-rows"

export {
  buildLineSpace,
  buildUnboundedLineSpace,
  type LineSpace,
} from "./line-space"

export {
  applyCommand,
  emptyDraft,
  type CommandOutcome,
  type ReviewCommand,
} from "./draft-reducer"

export {
  MIN_REVIEW_TEXT_CHARS,
  validateReview,
  type ReviewValidation,
  type SubmitBlocker,
} from "./validation"

export {
  parseGradeReport,
  parseStoredDraft,
  serializeStoredDraft,
  toSubmissionBody,
  type FindingVerdict,
  type GradeReport,
} from "./draft-codec"

export {
  buildVerdictOverlay,
  type VerdictMark,
  type VerdictTone,
} from "./verdict-overlay"
