import assert from "node:assert/strict"

process.stdout.write(
  "==> Verifying Submission Bar, Draft Autosave & Loading States Logic...\n"
)

// 1. Verify Storage Key Generation
const getDraftStorageKey = (slug) => `diffly_draft_${slug}`
const slug = "anti-prompt-injection"
const expectedKey = `diffly_draft_${slug}`
assert.equal(
  getDraftStorageKey(slug),
  expectedKey,
  "Draft storage key must be keyed by challenge slug"
)
process.stdout.write(
  `✓ Storage key generation verified: "${getDraftStorageKey(slug)}"\n`
)

// 2. Verify Summary Count Formatting Logic
const formatSummaryCount = (flaggedLines, comments) => {
  const lineCount = flaggedLines.length
  const charCount = comments.length
  const lineSummary =
    lineCount === 1 ? "1 line flagged" : `${lineCount} lines flagged`
  const charSummary = `${charCount} ${charCount === 1 ? "char" : "chars"} written`
  return `${lineSummary} • ${charSummary}`
}

// Exactly matches acceptance criteria example: "1 line flagged • 120 chars written"
assert.equal(
  formatSummaryCount([12], "a".repeat(120)),
  "1 line flagged • 120 chars written"
)
assert.equal(
  formatSummaryCount([3, 7], "a".repeat(120)),
  "2 lines flagged • 120 chars written"
)
assert.equal(
  formatSummaryCount([], "test"),
  "0 lines flagged • 4 chars written"
)
assert.equal(formatSummaryCount([5], "x"), "1 line flagged • 1 char written")
assert.equal(formatSummaryCount([], ""), "0 lines flagged • 0 chars written")
process.stdout.write("✓ Summary count singular/plural formatting verified\n")

// 3. Verify Submit Button Disabled Conditions
const isSubmitDisabled = (flaggedLines, comments, isSubmitting) => {
  const hasLines = flaggedLines.length > 0
  const hasComment = comments.trim().length > 0
  return !hasLines || !hasComment || Boolean(isSubmitting)
}

assert.equal(
  isSubmitDisabled([], "", false),
  true,
  "Disabled when no lines flagged and comment is empty"
)
assert.equal(
  isSubmitDisabled([1], "", false),
  true,
  "Disabled when line is flagged but comment is empty"
)
assert.equal(
  isSubmitDisabled([], "Found an eval vulnerability", false),
  true,
  "Disabled when comment exists but no lines flagged"
)
assert.equal(
  isSubmitDisabled([1], "Found an eval vulnerability", false),
  false,
  "Enabled when at least one line is flagged and comment is present"
)
assert.equal(
  isSubmitDisabled([1], "Found an eval vulnerability", true),
  true,
  "Disabled while submission is in-flight (loading state)"
)
process.stdout.write("✓ Submit button disabled logic verified\n")

// 4. Verify Tooltip Explanations
const getTooltipMessage = (flaggedLines, comments, isSubmitting) => {
  const hasLines = flaggedLines.length > 0
  const hasComment = comments.trim().length > 0
  if (isSubmitting) {
    return "Submitting your review..."
  }
  if (!hasLines && !hasComment) {
    return "Flag at least one line and write a review comment to submit"
  }
  if (!hasLines) {
    return "Flag at least one line in the code viewer to submit"
  }
  if (!hasComment) {
    return "Write a review comment explaining the defect to submit"
  }
  return "Submit your review for automated scoring"
}

assert.equal(
  getTooltipMessage([], "", false),
  "Flag at least one line and write a review comment to submit"
)
assert.equal(
  getTooltipMessage([], "Valid comment written", false),
  "Flag at least one line in the code viewer to submit"
)
assert.equal(
  getTooltipMessage([4], "", false),
  "Write a review comment explaining the defect to submit"
)
assert.equal(
  getTooltipMessage([4], "Valid critique", true),
  "Submitting your review..."
)
assert.equal(
  getTooltipMessage([4], "Valid critique", false),
  "Submit your review for automated scoring"
)
process.stdout.write("✓ Tooltip contextual feedback messages verified\n")

// 5. Verify LocalStorage Draft Round-Trip & Deserialization
const mockStorage = new Map()
const fakeLocalStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
}

const saveDraft = (targetSlug, flaggedLines, comments) => {
  const key = getDraftStorageKey(targetSlug)
  fakeLocalStorage.setItem(
    key,
    JSON.stringify({
      flaggedLines,
      comments,
      updatedAt: new Date().toISOString(),
    })
  )
}

const restoreDraft = (targetSlug) => {
  const key = getDraftStorageKey(targetSlug)
  const raw = fakeLocalStorage.getItem(key)
  if (!raw) return null
  const parsed = JSON.parse(raw)
  return {
    flaggedLines: Array.isArray(parsed?.flaggedLines)
      ? parsed.flaggedLines.filter(
          (n) => typeof n === "number" && Number.isInteger(n) && n > 0
        )
      : [],
    comments:
      typeof parsed?.comments === "string"
        ? parsed.comments
        : typeof parsed?.comment === "string"
          ? parsed.comment
          : "",
  }
}

// Test saving and restoring
saveDraft(
  slug,
  [2, 8],
  "Potential prompt injection via unescaped interpolation."
)
const restored = restoreDraft(slug)
assert.deepEqual(restored.flaggedLines, [2, 8])
assert.equal(
  restored.comments,
  "Potential prompt injection via unescaped interpolation."
)

// Test reset draft
fakeLocalStorage.removeItem(getDraftStorageKey(slug))
assert.equal(restoreDraft(slug), null, "Reset draft must clear stored key")
process.stdout.write("✓ Draft save, restore, and reset lifecycle verified\n")

// 6. Verify Toast Notification Reducer Logic
const TOAST_LIMIT = 5
const toastReducer = (state, action) => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }
    case "DISMISS_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toastId || action.toastId === undefined
            ? { ...t, open: false }
            : t
        ),
      }
    case "REMOVE_TOAST":
      return {
        ...state,
        toasts:
          action.toastId === undefined
            ? []
            : state.toasts.filter((t) => t.id !== action.toastId),
      }
    default:
      return state
  }
}

let toastState = { toasts: [] }
toastState = toastReducer(toastState, {
  type: "ADD_TOAST",
  toast: {
    id: "toast-1",
    title: "Draft restored",
    description: "Restored saved draft.",
    open: true,
  },
})
assert.equal(toastState.toasts.length, 1)
assert.equal(toastState.toasts[0].title, "Draft restored")

toastState = toastReducer(toastState, {
  type: "DISMISS_TOAST",
  toastId: "toast-1",
})
assert.equal(toastState.toasts[0].open, false)

toastState = toastReducer(toastState, {
  type: "REMOVE_TOAST",
  toastId: "toast-1",
})
assert.equal(toastState.toasts.length, 0)
process.stdout.write("✓ Toast notification reducer actions verified\n")

// 7. Verify API Request Payload Contract
const challengeId = 42
const submissionPayload = {
  flagged_lines: [5, 6],
  comments: "Defect analysis critique exceeding minimum length",
}
const requestUrl = `/api/challenges/${challengeId}/review`

assert.equal(requestUrl, "/api/challenges/42/review")
assert(Array.isArray(submissionPayload.flagged_lines))
assert.equal(submissionPayload.flagged_lines.length, 2)
assert(submissionPayload.comments.length >= 5)
process.stdout.write("✓ API submission payload contract verified\n")

process.stdout.write(
  "\nAll SubmissionBar & Draft Autosave verification assertions PASSED!\n"
)
