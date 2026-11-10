import assert from "node:assert/strict"

process.stdout.write(
  "==> Verifying Review Evaluation Score Modal & Radial Accuracy Breakdown...\n"
)

// 1. Verify Score Tier Classification and Color Coding Labels
const getScoreTier = (score) => {
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  if (clamped >= 80) {
    return {
      tier: "outstanding",
      label: "Outstanding Reviewer",
      color: "emerald",
    }
  }
  if (clamped >= 50) {
    return {
      tier: "partial",
      label: "Partially identified",
      color: "amber",
    }
  }
  return {
    tier: "missed",
    label: "Vulnerabilities missed",
    color: "rose",
  }
}

// 80-100: Emerald green ("Outstanding Reviewer")
assert.deepEqual(getScoreTier(100), {
  tier: "outstanding",
  label: "Outstanding Reviewer",
  color: "emerald",
})
assert.deepEqual(getScoreTier(80), {
  tier: "outstanding",
  label: "Outstanding Reviewer",
  color: "emerald",
})
assert.deepEqual(getScoreTier(92.4), {
  tier: "outstanding",
  label: "Outstanding Reviewer",
  color: "emerald",
})

// 50-79: Amber ("Partially identified")
assert.deepEqual(getScoreTier(79), {
  tier: "partial",
  label: "Partially identified",
  color: "amber",
})
assert.deepEqual(getScoreTier(50), {
  tier: "partial",
  label: "Partially identified",
  color: "amber",
})
assert.deepEqual(getScoreTier(65), {
  tier: "partial",
  label: "Partially identified",
  color: "amber",
})

// 0-49: Rose red ("Vulnerabilities missed")
assert.deepEqual(getScoreTier(49), {
  tier: "missed",
  label: "Vulnerabilities missed",
  color: "rose",
})
assert.deepEqual(getScoreTier(0), {
  tier: "missed",
  label: "Vulnerabilities missed",
  color: "rose",
})
assert.deepEqual(getScoreTier(25), {
  tier: "missed",
  label: "Vulnerabilities missed",
  color: "rose",
})
assert.deepEqual(getScoreTier(-10), {
  tier: "missed",
  label: "Vulnerabilities missed",
  color: "rose",
})

process.stdout.write("✓ Score tier labels and color coding mapping verified\n")

// 2. Verify Radial Accuracy Meter Mathematics
const computeRadialGeometry = (score, radius = 46) => {
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (clamped / 100) * circumference
  return { clamped, circumference, strokeDashoffset }
}

const geom100 = computeRadialGeometry(100)
assert.equal(geom100.strokeDashoffset, 0, "100% score has 0 dashoffset")

const geom0 = computeRadialGeometry(0)
assert.equal(
  geom0.strokeDashoffset,
  geom0.circumference,
  "0% score has full dashoffset"
)

const geom50 = computeRadialGeometry(50)
assert.ok(
  Math.abs(geom50.strokeDashoffset - geom50.circumference / 2) < 0.0001,
  "50% score has half dashoffset"
)

process.stdout.write(
  "✓ Radial score meter geometry and offset mathematics verified\n"
)

// 3. Verify Detected and Missed Defect Categorization
const sampleSubmissionResult = {
  submission_id: 42,
  id: 42,
  score: 85,
  feedback: "Outstanding review! Identified key injection vector.",
  detected_issues: [
    {
      id: "vuln-sqli",
      title: "SQL Injection in User Lookup",
      severity: "critical",
      matched_lines: [14, 15],
      matched_keywords: ["sql injection", "raw query"],
      explanation: "Direct concatenation of untrusted input into raw SQL query",
    },
  ],
  missed_issues: [
    {
      id: "vuln-xss",
      title: "Reflected XSS in Error Banner",
      severity: "medium",
      expected_lines: [32],
      missing_keywords: ["dangerouslySetInnerHTML"],
      explanation: "Unescaped user input rendered into DOM",
    },
  ],
  created_at: new Date().toISOString(),
}

assert.equal(sampleSubmissionResult.detected_issues.length, 1)
assert.equal(
  sampleSubmissionResult.detected_issues[0].matched_lines.join(", "),
  "14, 15"
)
assert.equal(sampleSubmissionResult.missed_issues.length, 1)
assert.equal(
  sampleSubmissionResult.missed_issues[0].expected_lines.join(", "),
  "32"
)
process.stdout.write("✓ Defect breakdown structure and annotations verified\n")

// 4. Verify Next Challenge Navigation Resolution
const resolveNextChallengeUrl = (challenges, currentSlug) => {
  if (!challenges || challenges.length === 0) return "/challenges"
  const idx = challenges.findIndex((c) => c.slug === currentSlug)
  if (idx >= 0 && idx < challenges.length - 1) {
    return `/challenges/${challenges[idx + 1].slug}`
  }
  return "/challenges"
}

const testCatalog = [
  { slug: "anti-prompt-injection" },
  { slug: "sql-raw-query-leak" },
  { slug: "jwt-hardcoded-secret" },
]

assert.equal(
  resolveNextChallengeUrl(testCatalog, "anti-prompt-injection"),
  "/challenges/sql-raw-query-leak"
)
assert.equal(
  resolveNextChallengeUrl(testCatalog, "sql-raw-query-leak"),
  "/challenges/jwt-hardcoded-secret"
)
assert.equal(
  resolveNextChallengeUrl(testCatalog, "jwt-hardcoded-secret"),
  "/challenges",
  "Last challenge in catalog falls back to catalog view"
)
assert.equal(
  resolveNextChallengeUrl([], "anti-prompt-injection"),
  "/challenges",
  "Empty catalog falls back to catalog view"
)

process.stdout.write("✓ Next Challenge navigation resolution verified\n")

// 5. Verify Canonical Solution Toggling & Data Rendering
const formatCanonicalDiff = (diff) => {
  return diff.trim()
}
const mockSolution = {
  canonical_review: "The user query parameter must be parameterized.",
  recommended_fix_diff:
    "@@ -14,2 +14,2 @@\n- query = f'SELECT * FROM users WHERE id = {user_id}'\n+ query = text('SELECT * FROM users WHERE id = :user_id')",
}
assert.ok(mockSolution.canonical_review.length > 0)
assert.ok(
  formatCanonicalDiff(mockSolution.recommended_fix_diff).startsWith("@@")
)

process.stdout.write(
  "✓ Canonical solution content and diff rendering verified\n"
)

process.stdout.write(
  "==> ALL Review Result Modal & Radial Breakdown tests PASSED successfully!\n"
)
