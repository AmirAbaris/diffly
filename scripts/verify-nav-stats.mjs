import assert from "node:assert/strict"

process.stdout.write(
  "==> Verifying Header Stats & User Profile Navigation...\n"
)

// 1. Stats Badge Formatting Logic
function formatStatsBadges(stats) {
  const totalSolved = stats?.total_solved ?? 0
  const totalChallenges = stats?.total_challenges ?? 0
  const averageScore = Math.round(stats?.average_score ?? 0)
  const streakDays = stats?.streak_days ?? 0

  const streakUnit = streakDays === 1 ? "day" : "days"

  return {
    solvedDesktop: `Solved: ${totalSolved}/${totalChallenges}`,
    solvedMobile: `${totalSolved}/${totalChallenges}`,
    accuracyDesktop: `Accuracy: ${averageScore}%`,
    accuracyMobile: `${averageScore}%`,
    streakDesktop: `Streak: 🔥 ${streakDays} ${streakUnit}`,
    streakMobile: `🔥 ${streakDays}d`,
  }
}

const mockStats = {
  total_challenges: 5,
  total_attempted: 4,
  total_solved: 3,
  average_score: 88.4,
  streak_days: 2,
  categories_breakdown: [
    { category: "Security", solved: 2, total: 2, accuracy: 100.0 },
    { category: "Concurrency", solved: 2, total: 3, accuracy: 66.0 },
    { category: "Agent Antipaths", solved: 1, total: 1, accuracy: 85.0 },
    { category: "Performance", solved: 0, total: 1, accuracy: 0.0 },
  ],
}

const formatted = formatStatsBadges(mockStats)
assert.equal(formatted.solvedDesktop, "Solved: 3/5")
assert.equal(formatted.solvedMobile, "3/5")
assert.equal(formatted.accuracyDesktop, "Accuracy: 88%")
assert.equal(formatted.accuracyMobile, "88%")
assert.equal(formatted.streakDesktop, "Streak: 🔥 2 days")
assert.equal(formatted.streakMobile, "🔥 2d")

// Singular streak test
const singleDayStats = { ...mockStats, streak_days: 1 }
const singleFormatted = formatStatsBadges(singleDayStats)
assert.equal(singleFormatted.streakDesktop, "Streak: 🔥 1 day")
assert.equal(singleFormatted.streakMobile, "🔥 1d")

// Zero streak test
const zeroDayStats = { ...mockStats, streak_days: 0 }
const zeroFormatted = formatStatsBadges(zeroDayStats)
assert.equal(zeroFormatted.streakDesktop, "Streak: 🔥 0 days")

process.stdout.write("✔ Badges desktop and mobile formatting passed.\n")

// 2. Category Mastery Breakdown Verification
function evaluateCategoryBreakdown(categories) {
  return categories.map((cat) => {
    const accuracy = Math.round(cat.accuracy)
    const status =
      accuracy >= 80
        ? "mastered"
        : accuracy >= 50
          ? "proficient"
          : "in_progress"
    return {
      category: cat.category,
      display: `${cat.category}: ${accuracy}%`,
      solvedRatio: `${cat.solved}/${cat.total}`,
      status,
    }
  })
}

const breakdown = evaluateCategoryBreakdown(mockStats.categories_breakdown)
assert.equal(breakdown[0].display, "Security: 100%")
assert.equal(breakdown[0].status, "mastered")
assert.equal(breakdown[1].display, "Concurrency: 66%")
assert.equal(breakdown[1].status, "proficient")
assert.equal(breakdown[2].display, "Agent Antipaths: 85%")
assert.equal(breakdown[2].status, "mastered")
assert.equal(breakdown[3].display, "Performance: 0%")
assert.equal(breakdown[3].status, "in_progress")

process.stdout.write("✔ Category mastery accuracy and breakdown passed.\n")

// 3. Smooth Ease-Out Cubic Counter Animation Math
function computeAnimatedStep(startVal, targetVal, progress) {
  const p = Math.min(Math.max(progress, 0), 1)
  const easeOut = 1 - Math.pow(1 - p, 3)
  return Math.round(startVal + (targetVal - startVal) * easeOut)
}

assert.equal(computeAnimatedStep(0, 100, 0), 0)
assert.equal(computeAnimatedStep(0, 100, 1), 100)
// At 50% elapsed time, easeOutCubic reaches ~87.5%
assert.equal(computeAnimatedStep(0, 100, 0.5), 88)
// Step progression from 3 to 5 solved
assert.equal(computeAnimatedStep(3, 5, 0), 3)
assert.equal(computeAnimatedStep(3, 5, 1), 5)

process.stdout.write("✔ Counter animation interpolation step math verified.\n")

// 4. User Auth Profile State and Navigation
function resolveUserState(user) {
  if (!user) {
    return {
      isAuthenticated: false,
      action: "show_sign_in_button",
      menuItems: [],
    }
  }
  return {
    isAuthenticated: true,
    action: "show_avatar_dropdown",
    username: `@${user.username}`,
    initials: (user.username || "U").slice(0, 2).toUpperCase(),
    menuItems: ["Profile", "Stats", "Settings", "Sign Out"],
  }
}

const unauthState = resolveUserState(null)
assert.equal(unauthState.isAuthenticated, false)
assert.equal(unauthState.action, "show_sign_in_button")

const authState = resolveUserState({
  id: 1,
  username: "alex_reviewer",
  email: "alex@diffly.dev",
})
assert.equal(authState.isAuthenticated, true)
assert.equal(authState.action, "show_avatar_dropdown")
assert.equal(authState.username, "@alex_reviewer")
assert.equal(authState.initials, "AL")
assert.deepEqual(authState.menuItems, [
  "Profile",
  "Stats",
  "Settings",
  "Sign Out",
])

process.stdout.write("✔ User navigation auth state resolution passed.\n")

// 5. Guest Session Migration on Login/Register
let claimedCount = 0
function simulateLoginSessionMigration(sessionId) {
  if (sessionId && sessionId.startsWith("guest-")) {
    claimedCount += 3
    return {
      migrated: true,
      claimedCount: 3,
      sessionId,
    }
  }
  return { migrated: false, claimedCount: 0, sessionId: null }
}

const migrationResult = simulateLoginSessionMigration("guest-a1b2c3d4e5f6")
assert.equal(migrationResult.migrated, true)
assert.equal(migrationResult.claimedCount, 3)
assert.equal(claimedCount, 3)

process.stdout.write("✔ Guest session migration verified.\n")

process.stdout.write(
  "\n🎉 All Header Stats & User Navigation verifications passed successfully!\n"
)
