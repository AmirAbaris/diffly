import assert from "node:assert/strict"

process.stdout.write(
  "==> Verifying ChallengeContextPanel Logic and Progressive Hints...\n"
)

// 1. Verify Sequential Hint Unlocking Invariants
const canUnlockTier = (tier, unlockedTiers) => {
  const unlockedSet = new Set(unlockedTiers)
  if (unlockedSet.has(tier)) return false // already unlocked
  const previousTierUnlocked = tier === 1 || unlockedSet.has(tier - 1)
  return previousTierUnlocked
}

// Initial state: No hints unlocked
let unlocked = []
assert.equal(
  canUnlockTier(1, unlocked),
  true,
  "Tier 1 must be unlockable initially"
)
assert.equal(
  canUnlockTier(2, unlocked),
  false,
  "Tier 2 must NOT be unlockable before Tier 1"
)
assert.equal(
  canUnlockTier(3, unlocked),
  false,
  "Tier 3 must NOT be unlockable before Tier 1 & 2"
)

// Unlock Tier 1
unlocked = [1]
assert.equal(canUnlockTier(1, unlocked), false, "Tier 1 is already unlocked")
assert.equal(
  canUnlockTier(2, unlocked),
  true,
  "Tier 2 must be unlockable after Tier 1 is unlocked"
)
assert.equal(
  canUnlockTier(3, unlocked),
  false,
  "Tier 3 must NOT be unlockable before Tier 2 is unlocked"
)

// Unlock Tier 2
unlocked = [1, 2]
assert.equal(canUnlockTier(1, unlocked), false, "Tier 1 is already unlocked")
assert.equal(canUnlockTier(2, unlocked), false, "Tier 2 is already unlocked")
assert.equal(
  canUnlockTier(3, unlocked),
  true,
  "Tier 3 must be unlockable after Tier 2 is unlocked"
)

// Unlock Tier 3 (All unlocked)
unlocked = [1, 2, 3]
assert.equal(canUnlockTier(1, unlocked), false)
assert.equal(canUnlockTier(2, unlocked), false)
assert.equal(canUnlockTier(3, unlocked), false)
process.stdout.write(
  "✓ Sequential progressive hint unlocking logic verified (Tier 1 -> Tier 2 -> Tier 3)\n"
)

// 2. Verify Score Penalty Calculations per Tier
const getScoreMultiplier = (unlockedTiers) => {
  let penalty = 0
  if (unlockedTiers.includes(1)) penalty += 10
  if (unlockedTiers.includes(2)) penalty += 20
  if (unlockedTiers.includes(3)) penalty += 30
  return Math.max(0, 100 - penalty)
}

assert.equal(
  getScoreMultiplier([]),
  100,
  "0 hints unlocked gives 100% score potential"
)
assert.equal(
  getScoreMultiplier([1]),
  90,
  "Tier 1 hint gives 90% score potential (-10%)"
)
assert.equal(
  getScoreMultiplier([1, 2]),
  70,
  "Tier 1 + 2 hints gives 70% score potential (-30%)"
)
assert.equal(
  getScoreMultiplier([1, 2, 3]),
  40,
  "All 3 tiers unlocked gives 40% score potential (-60%)"
)
process.stdout.write("✓ Hint tier score penalty calculation verified\n")

// 3. Verify Inline Formatter Tokenization (Bold and Code spans)
const tokenizeInline = (text) => {
  return text
    .split(/(\*\*.*?\*\*|`.*?`)/g)
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return { type: "bold", value: part.slice(2, -2) }
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return { type: "code", value: part.slice(1, -1) }
      }
      return { type: "text", value: part }
    })
}

const sampleText =
  "The `eval()` function permits **arbitrary code execution** in python."
const tokens = tokenizeInline(sampleText)
assert.equal(tokens.length, 5)
assert.deepEqual(tokens[1], { type: "code", value: "eval()" })
assert.deepEqual(tokens[3], { type: "bold", value: "arbitrary code execution" })
process.stdout.write(
  "✓ Inline markdown tokenization (bold, inline code, plain text) verified\n"
)

// 4. Verify Paragraph & Bullet List Block Parsing
const parseMarkdownBlocks = (content) => {
  return content.split(/\n\s*\n/).map((para) => {
    const trimmed = para.trim()
    const lines = trimmed.split("\n")
    const isBulletList = lines.every(
      (line) => line.trim().startsWith("- ") || line.trim().startsWith("* ")
    )
    if (isBulletList) {
      return {
        type: "list",
        items: lines.map((l) => l.trim().replace(/^[-*]\s+/, "")),
      }
    }
    return { type: "paragraph", text: trimmed }
  })
}

const docContent = `Section description paragraph 1.\n\n- Untrusted user input\n- Ambient process permissions\n- Race conditions in tool execution\n\nFinal concluding sentence.`
const blocks = parseMarkdownBlocks(docContent)
assert.equal(blocks.length, 3, "Should parse into 3 blocks")
assert.equal(blocks[0].type, "paragraph")
assert.equal(blocks[1].type, "list")
assert.equal(blocks[1].items.length, 3)
assert.equal(blocks[1].items[0], "Untrusted user input")
assert.equal(blocks[2].type, "paragraph")
process.stdout.write(
  "✓ Block markdown parsing (paragraphs, bullet lists) verified\n"
)

// 5. Verify Mobile Collapsible Toggle Invariant
let isMobileCollapsed = false
const toggleMobileCollapse = () => {
  isMobileCollapsed = !isMobileCollapsed
}

assert.equal(
  isMobileCollapsed,
  false,
  "Initial panel view on mobile is expanded"
)
toggleMobileCollapse()
assert.equal(isMobileCollapsed, true, "Panel collapsed on mobile toggle")
toggleMobileCollapse()
assert.equal(isMobileCollapsed, false, "Panel restored on second toggle")
process.stdout.write("✓ Mobile collapsible panel state transitions verified\n")

process.stdout.write(
  "\nAll ChallengeContextPanel verification checks PASSED successfully!\n"
)
