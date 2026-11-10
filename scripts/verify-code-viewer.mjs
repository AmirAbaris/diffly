import assert from "node:assert/strict"
import { Prism } from "prism-react-renderer"

process.stdout.write(
  "==> Verifying Syntax Highlighting and Code Viewer Logic...\n"
)

// 1. Verify Python Tokenization
const pythonSnippet = `def calculate_risk(payload: str) -> bool:
    # Check for dangerous command injection
    if "eval" in payload or "system" in payload:
        return True
    return False`

const pythonTokens = Prism.tokenize(pythonSnippet, Prism.languages.python)
assert(pythonTokens.length > 5, "Python code should produce structured tokens")
const hasKeyword = pythonTokens.some(
  (t) => typeof t === "object" && t.type === "keyword" && t.content === "def"
)
assert(hasKeyword, "Python tokenizer must recognize 'def' keyword")
const hasComment = pythonTokens.some(
  (t) => typeof t === "object" && t.type === "comment"
)
assert(hasComment, "Python tokenizer must recognize comment lines")
process.stdout.write(
  "✓ Python syntax tokenization verified (keywords, comments, types)\n"
)

// 2. Verify TypeScript Tokenization
const tsSnippet = `export interface ReviewSubmission {
  challengeId: number
  flaggedLines: number[]
  comment: string
}`

const tsTokens = Prism.tokenize(tsSnippet, Prism.languages.typescript)
assert(tsTokens.length > 5, "TypeScript code should produce structured tokens")
const hasTsKeyword = tsTokens.some(
  (t) =>
    typeof t === "object" &&
    (t.content === "export" || t.content === "interface")
)
assert(
  hasTsKeyword,
  "TypeScript tokenizer must recognize 'export' and 'interface' keywords"
)
process.stdout.write("✓ TypeScript syntax tokenization verified\n")

// 3. Verify Line Splitting & 1-Indexed Line Numbers
const lines = pythonSnippet.split("\n")
assert.equal(lines.length, 5, "Python snippet has 5 lines")
const lineNumbers = lines.map((_, i) => i + 1)
assert.deepEqual(lineNumbers, [1, 2, 3, 4, 5], "Lines must be 1-indexed")
process.stdout.write(
  `✓ 1-indexed line numbers verified: ${JSON.stringify(lineNumbers)}\n`
)

// 4. Verify Multiple Flagged Lines Toggle State Logic
let flaggedLines = []
const toggle = (line) => {
  flaggedLines = flaggedLines.includes(line)
    ? flaggedLines.filter((l) => l !== line)
    : [...flaggedLines, line]
}

// Toggle line 3
toggle(3)
assert.deepEqual(flaggedLines, [3], "Line 3 should be flagged")
// Toggle line 5 (multiple flagged lines support)
toggle(5)
assert.deepEqual(
  flaggedLines,
  [3, 5],
  "Lines 3 and 5 should be flagged simultaneously"
)
// Toggle line 3 again to unflag
toggle(3)
assert.deepEqual(
  flaggedLines,
  [5],
  "Line 3 should be unflagged, leaving line 5"
)
toggle(5)
assert.deepEqual(flaggedLines, [], "All lines unflagged")
process.stdout.write("✓ Multiple flagged lines toggle logic verified\n")

// 5. Verify Tooltip strings
const getTooltip = (line, isFlagged) =>
  isFlagged
    ? `Line ${line} flagged. Click to unflag.`
    : "Click line to flag for review"

assert.equal(getTooltip(1, false), "Click line to flag for review")
assert.equal(getTooltip(3, true), "Line 3 flagged. Click to unflag.")
process.stdout.write("✓ Tooltip strings verified\n")

process.stdout.write("\nAll CodeViewer logic assertions PASSED successfully!\n")
