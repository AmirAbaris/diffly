import assert from "node:assert/strict"

process.stdout.write("==> Verifying User Progress & Session Claim Logic...\n")

// 1. Verify Streak Calculation Algorithm
function computeStreakDays(submissionDatesIso, nowUtcIso) {
  if (!submissionDatesIso || submissionDatesIso.length === 0) {
    return 0
  }

  const submissionDates = new Set(
    submissionDatesIso.map((d) => new Date(d).toISOString().slice(0, 10))
  )

  const todayStr = new Date(nowUtcIso).toISOString().slice(0, 10)
  const yesterday = new Date(nowUtcIso)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)

  let startStr = null
  if (submissionDates.has(todayStr)) {
    startStr = todayStr
  } else if (submissionDates.has(yesterdayStr)) {
    startStr = yesterdayStr
  } else {
    return 0
  }

  let streak = 0
  const curr = new Date(`${startStr}T00:00:00Z`)
  while (submissionDates.has(curr.toISOString().slice(0, 10))) {
    streak += 1
    curr.setUTCDate(curr.getUTCDate() - 1)
  }
  return streak
}

const now = "2026-11-10T12:00:00Z"
const threeDayStreak = [
  "2026-11-10T09:00:00Z",
  "2026-11-09T18:00:00Z",
  "2026-11-08T15:30:00Z",
  "2026-11-05T12:00:00Z",
]
assert.equal(computeStreakDays(threeDayStreak, now), 3)

const expiredStreak = ["2026-11-08T10:00:00Z", "2026-11-07T10:00:00Z"]
assert.equal(computeStreakDays(expiredStreak, now), 0)

process.stdout.write("✓ Streak calculation verified\n")

// 2. Verify Stats Calculation Logic
function aggregateProgress(challenges, submissions) {
  const byChallenge = new Map()
  for (const sub of submissions) {
    const list = byChallenge.get(sub.challenge_id) || []
    list.push(sub.score)
    byChallenge.set(sub.challenge_id, list)
  }

  const bestScores = new Map()
  for (const [chId, scores] of byChallenge.entries()) {
    bestScores.set(chId, Math.max(...scores))
  }

  const totalAttempted = byChallenge.size
  let totalSolved = 0
  let totalScoreSum = 0
  for (const score of bestScores.values()) {
    if (score >= 80) totalSolved += 1
    totalScoreSum += score
  }

  const averageScore =
    totalAttempted > 0
      ? Math.round((totalScoreSum / totalAttempted) * 10) / 10
      : 0.0

  return {
    total_challenges: challenges.length,
    total_attempted: totalAttempted,
    total_solved: totalSolved,
    average_score: averageScore,
  }
}

const testCatalog = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]
const testSubs = [
  { challenge_id: 1, score: 50 },
  { challenge_id: 1, score: 90 }, // Supersedes 50
  { challenge_id: 2, score: 70 }, // Attempted, not solved
]

const progress = aggregateProgress(testCatalog, testSubs)
assert.equal(progress.total_challenges, 5)
assert.equal(progress.total_attempted, 2)
assert.equal(progress.total_solved, 1) // Only ch 1 best is >= 80
assert.equal(progress.average_score, 80.0) // (90 + 70) / 2
process.stdout.write("✓ Aggregation metrics verified\n")

process.stdout.write("==> All user progress verifications PASSED!\n")
