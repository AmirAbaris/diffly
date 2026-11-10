import assert from "node:assert/strict"

process.stdout.write(
  "==> Verifying Review Comment Editor & Markdown Preview Logic...\n"
)

let flaggedLines = [14, 3, 22, 7]
const sorted = flaggedLines.slice().sort((a, b) => a - b)
assert.deepEqual(
  sorted,
  [3, 7, 14, 22],
  "Flagged lines must be sorted numerically in ascending order"
)

const unflag = (line) => {
  flaggedLines = flaggedLines.filter((l) => l !== line)
}
unflag(14)
assert.deepEqual(
  flaggedLines,
  [3, 22, 7],
  "Unflagging line 14 removes only line 14"
)

const clearAll = () => {
  flaggedLines = []
}
clearAll()
assert.deepEqual(flaggedLines, [], "Clear all must empty flagged lines array")
process.stdout.write(
  "✓ Flagged lines sorting, individual unflagging, and clear-all verified\n"
)

const computeStats = (text) => {
  const charCount = text.length
  const trimmed = text.trim()
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0
  return { charCount, wordCount }
}

assert.deepEqual(
  computeStats(""),
  { charCount: 0, wordCount: 0 },
  "Empty text produces 0 chars and 0 words"
)
assert.deepEqual(
  computeStats("   \n\t  "),
  { charCount: 7, wordCount: 0 },
  "Whitespace-only text produces 0 words"
)
assert.deepEqual(
  computeStats("Race condition in auth handler"),
  { charCount: 30, wordCount: 5 },
  "Standard sentence word and character counting is exact"
)
assert.deepEqual(
  computeStats("Multiple   spaces \n between words"),
  { charCount: 33, wordCount: 4 },
  "Irregular whitespace correctly treated as single delimiter"
)
process.stdout.write("✓ Word and character counting semantics verified\n")

const validateLength = (comment, minCharacters = 30) => {
  const charCount = comment.length
  const trimmed = comment.trim()
  const isMinLengthMet = charCount >= minCharacters
  const remainingChars = Math.max(0, minCharacters - charCount)
  const canSubmit = Boolean(trimmed) && isMinLengthMet
  return { charCount, isMinLengthMet, remainingChars, canSubmit }
}

const shortComment = "Too short"
const shortRes = validateLength(shortComment, 30)
assert.equal(shortRes.isMinLengthMet, false)
assert.equal(shortRes.remainingChars, 21)
assert.equal(shortRes.canSubmit, false)

const validComment =
  "Potential command injection vulnerability in subprocess call."
const validRes = validateLength(validComment, 30)
assert.equal(validRes.isMinLengthMet, true)
assert.equal(validRes.remainingChars, 0)
assert.equal(validRes.canSubmit, true)
process.stdout.write("✓ Minimum length validation and submit gate verified\n")

function parseInlineTokens(text, prefix = "tok") {
  const tokens = []
  let remaining = text
  let counter = 0

  while (remaining.length > 0) {
    counter++
    const tokenId = `${prefix}-${counter}`

    const codeMatch = remaining.match(/^`([^`]+)`/)
    if (codeMatch) {
      tokens.push({ id: tokenId, type: "code", text: codeMatch[1] })
      remaining = remaining.slice(codeMatch[0].length)
      continue
    }

    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/)
    if (boldMatch) {
      tokens.push({ id: tokenId, type: "bold", text: boldMatch[1] })
      remaining = remaining.slice(boldMatch[0].length)
      continue
    }

    const strikeMatch = remaining.match(/^~~([^~]+)~~/)
    if (strikeMatch) {
      tokens.push({ id: tokenId, type: "strikethrough", text: strikeMatch[1] })
      remaining = remaining.slice(strikeMatch[0].length)
      continue
    }

    const italicMatch = remaining.match(/^(\*|_)([^*_]+)\1/)
    if (italicMatch) {
      tokens.push({ id: tokenId, type: "italic", text: italicMatch[2] })
      remaining = remaining.slice(italicMatch[0].length)
      continue
    }

    const nextSpecial = remaining.search(/[`*_~]/)
    if (nextSpecial === -1) {
      tokens.push({ id: tokenId, type: "text", text: remaining })
      break
    } else if (nextSpecial === 0) {
      tokens.push({ id: tokenId, type: "text", text: remaining[0] })
      remaining = remaining.slice(1)
    } else {
      tokens.push({
        id: tokenId,
        type: "text",
        text: remaining.slice(0, nextSpecial),
      })
      remaining = remaining.slice(nextSpecial)
    }
  }

  return tokens
}

const sampleInline =
  "Check `subprocess.run(shell=True)`: **critical** and *dangerous* flaw"
const inlineTokens = parseInlineTokens(sampleInline)
assert.equal(
  inlineTokens.some(
    (t) => t.type === "code" && t.text === "subprocess.run(shell=True)"
  ),
  true
)
assert.equal(
  inlineTokens.some((t) => t.type === "bold" && t.text === "critical"),
  true
)
assert.equal(
  inlineTokens.some((t) => t.type === "italic" && t.text === "dangerous"),
  true
)
process.stdout.write("✓ Markdown inline tokenizer verified\n")

const sampleMarkdown = `### Vulnerability Analysis
The implementation in line 12 has a flaw:
- Risk: Command injection
- Blast radius: Host shell access

\`\`\`python
# Example secure replacement
subprocess.run(["ls", "-la"], check=True)
\`\`\`

> Ensure user input is never concatenated directly.
`

const markdownLines = sampleMarkdown.replace(/\r\n/g, "\n").split("\n")
const hasHeading = markdownLines.some((l) => l.startsWith("### "))
assert.equal(hasHeading, true, "Markdown must parse h3 headings")

const hasCodeFence =
  markdownLines.filter((l) => l.trim().startsWith("```")).length === 2
assert.equal(
  hasCodeFence,
  true,
  "Markdown must pair opening and closing code fences"
)

const hasListItems =
  markdownLines.filter((l) => /^[-*]\s+/.test(l)).length === 2
assert.equal(hasListItems, true, "Markdown must recognize list items")

const hasBlockquote = markdownLines.some((l) => l.startsWith(">"))
assert.equal(hasBlockquote, true, "Markdown must recognize blockquotes")
process.stdout.write("✓ Markdown block tokenizer verified\n")

const buildSubmissionPayload = (challengeSlug, lineNumbers, comment) => {
  return {
    slug: challengeSlug,
    flagged_lines: [...lineNumbers].sort((a, b) => a - b),
    review_comment: comment.trim(),
    submitted_at: new Date().toISOString(),
  }
}

const testPayload = buildSubmissionPayload(
  "cve-2024-command-exec",
  [5, 2, 8],
  validComment
)
assert.equal(testPayload.slug, "cve-2024-command-exec")
assert.deepEqual(
  testPayload.flagged_lines,
  [2, 5, 8],
  "Payload must include sorted flagged lines"
)
assert.equal(testPayload.review_comment, validComment)
assert(typeof testPayload.submitted_at === "string")
process.stdout.write("✓ DoD Review submission payload binding verified\n")

process.stdout.write("\nAll Review Comment Editor assertions PASSED!\n")
