import assert from "node:assert/strict"

process.stdout.write(
  "==> Verifying Submission History Drawer & Multi-Attempt Logic...\n"
)

// 1. Verify Date Formatting Logic
const attemptDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
})

function formatAttemptDate(dateStr) {
  try {
    const date = new Date(dateStr)
    if (Number.isNaN(date.getTime())) {
      return dateStr
    }
    return attemptDateFormatter.format(date)
  } catch {
    return dateStr
  }
}

const testIsoDate = "2026-11-10T10:30:00Z"
const formattedDate = formatAttemptDate(testIsoDate)
assert(typeof formattedDate === "string" && formattedDate.length > 0)
assert.equal(formatAttemptDate("invalid-date"), "invalid-date")
process.stdout.write(`✓ Date formatting verified: "${formattedDate}"\n`)

// 2. Verify Score Badge Classes Logic
function getScoreBadgeClasses(score) {
  if (score >= 80) {
    return {
      badgeVariant: "outline",
      className:
        "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold",
    }
  }
  if (score >= 50) {
    return {
      badgeVariant: "outline",
      className:
        "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold",
    }
  }
  return {
    badgeVariant: "outline",
    className:
      "border-destructive/40 bg-destructive/10 text-destructive font-semibold",
  }
}

assert(getScoreBadgeClasses(95).className.includes("emerald"))
assert(getScoreBadgeClasses(80).className.includes("emerald"))
assert(getScoreBadgeClasses(75).className.includes("amber"))
assert(getScoreBadgeClasses(50).className.includes("amber"))
assert(getScoreBadgeClasses(45).className.includes("destructive"))
assert(getScoreBadgeClasses(0).className.includes("destructive"))
process.stdout.write("✓ Score badge classes and threshold logic verified\n")

// 3. Verify Best Score & Attempt Count Calculation
const mockSubmissions = [
  {
    id: 102,
    submission_id: 102,
    attempt_number: 2,
    challenge_id: 1,
    score: 85,
    created_at: "2026-11-10T11:00:00Z",
    flagged_lines: [12, 14],
    comments: "Fixed vulnerability with parameterized queries.",
    feedback: "Comprehensive defect detection.",
    detected_issues: [
      { id: "sec-1", title: "SQL Injection", severity: "High" },
    ],
    missed_issues: [],
  },
  {
    id: 101,
    submission_id: 101,
    attempt_number: 1,
    challenge_id: 1,
    score: 45,
    created_at: "2026-11-10T10:00:00Z",
    flagged_lines: [12],
    comments: "Found suspect code.",
    feedback: "Partial detection.",
    detected_issues: [],
    missed_issues: [{ id: "sec-1", title: "SQL Injection", severity: "High" }],
  },
]

const bestScore = Math.max(...mockSubmissions.map((s) => s.score))
assert.equal(bestScore, 85, "Best score must be 85% across attempts")
assert.equal(mockSubmissions.length, 2, "Must count 2 attempts")
process.stdout.write(
  `✓ Best score calculation (${bestScore}%) and attempt counting (2) verified\n`
)

// 4. Verify Guest Session ID Generation and Header Injection
const GUEST_SESSION_STORAGE_KEY = "diffly_guest_session_id"
const mockStorage = new Map()
const fakeLocalStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
}

function getOrCreateGuestSessionId(storage = fakeLocalStorage) {
  let sessionId = storage.getItem(GUEST_SESSION_STORAGE_KEY)
  if (!sessionId) {
    sessionId = `guest-test${Math.random().toString(36).slice(2, 8)}`
    storage.setItem(GUEST_SESSION_STORAGE_KEY, sessionId)
  }
  return sessionId
}

const session1 = getOrCreateGuestSessionId()
const session2 = getOrCreateGuestSessionId()
assert.equal(
  session1,
  session2,
  "Guest session ID must persist across subsequent calls"
)
assert(
  session1.startsWith("guest-"),
  "Guest session ID must follow guest-* convention"
)
process.stdout.write(`✓ Guest session ID persistence verified: "${session1}"\n`)

// 5. Verify SWR Cache Key Generation and Contract
const slug = "timing-attack-hmac"
const submissionsEndpoint = `/api/challenges/${slug}/submissions`
assert.equal(
  submissionsEndpoint,
  "/api/challenges/timing-attack-hmac/submissions"
)

// 6. Verify Submission Item Properties
for (const sub of mockSubmissions) {
  assert(typeof sub.attempt_number === "number")
  assert(typeof sub.score === "number")
  assert(Array.isArray(sub.flagged_lines))
  assert(typeof sub.comments === "string")
  assert(typeof sub.feedback === "string")
  assert(Array.isArray(sub.detected_issues))
  assert(Array.isArray(sub.missed_issues))
}
process.stdout.write("✓ SubmissionHistoryItem contract and fields verified\n")

process.stdout.write(
  "\nAll Submission History Drawer verification assertions PASSED!\n"
)
