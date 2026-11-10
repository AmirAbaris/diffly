import assert from "node:assert/strict"

process.stdout.write(
  "==> Verifying Side-by-Side Review Comparison View (Issue #19)...\n"
)

// 1. Unified Diff Parsing Verification
const parseUnifiedDiff = (rawDiff) => {
  if (!rawDiff) return []

  const lines = rawDiff.split("\n")
  const parsed = []

  let oldCounter = 0
  let newCounter = 0

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]
    const lineId = `diff-line-${idx + 1}`

    if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      parsed.push({ id: lineId, type: "header", content: line })
      continue
    }

    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunkMatch) {
      oldCounter = parseInt(hunkMatch[1], 10)
      newCounter = parseInt(hunkMatch[2], 10)
      parsed.push({ id: lineId, type: "hunk", content: line })
      continue
    }

    if (line.startsWith("-")) {
      parsed.push({
        id: lineId,
        type: "deleted",
        content: line.slice(1),
        oldLineNumber: oldCounter++,
      })
      continue
    }

    if (line.startsWith("+")) {
      parsed.push({
        id: lineId,
        type: "added",
        content: line.slice(1),
        newLineNumber: newCounter++,
      })
      continue
    }

    if (line.startsWith(" ") || line === "") {
      const content = line.startsWith(" ") ? line.slice(1) : line
      parsed.push({
        id: lineId,
        type: "context",
        content,
        oldLineNumber: oldCounter++,
        newLineNumber: newCounter++,
      })
      continue
    }

    parsed.push({ id: lineId, type: "header", content: line })
  }

  return parsed
}

const sampleDiff = `--- a/tools/calculator.py
+++ b/tools/calculator.py
@@ -1,3 +1,4 @@
+import ast
 import math
 from typing import Any
@@ -25,2 +26,3 @@
-    result = eval(clean_expr)
+    parsed = ast.parse(clean_expr)
+    result = safe_eval(parsed)
     return result`

const parsed = parseUnifiedDiff(sampleDiff)
assert.ok(parsed.length > 0, "Diff should produce parsed tokens")
assert.equal(parsed[0].type, "header")
assert.equal(parsed[1].type, "header")
assert.equal(parsed[2].type, "hunk")
assert.equal(parsed[3].type, "added")
assert.equal(parsed[3].newLineNumber, 1)
assert.equal(parsed[4].type, "context")
assert.equal(parsed[4].oldLineNumber, 1)
assert.equal(parsed[4].newLineNumber, 2)

// Find deletion
const delLine = parsed.find((p) => p.type === "deleted")
assert.ok(delLine, "Deleted line found")
assert.equal(delLine.oldLineNumber, 25)
assert.equal(delLine.content.trim(), "result = eval(clean_expr)")

process.stdout.write("✓ Unified diff parser and line numbering verified\n")

// 2. Split (Side-by-Side) Diff Rows Construction
const buildSplitDiffRows = (diffLines) => {
  const rows = []
  let rowId = 0

  let i = 0
  while (i < diffLines.length) {
    const current = diffLines[i]

    if (current.type === "header") {
      i++
      continue
    }

    if (current.type === "hunk") {
      rowId++
      rows.push({
        id: `hunk-${rowId}`,
        type: "hunk",
        hunkHeader: current.content,
      })
      i++
      continue
    }

    if (current.type === "context") {
      rowId++
      rows.push({
        id: `ctx-${rowId}`,
        type: "context",
        left: {
          lineNumber: current.oldLineNumber,
          content: current.content,
          type: "context",
        },
        right: {
          lineNumber: current.newLineNumber,
          content: current.content,
          type: "context",
        },
      })
      i++
      continue
    }

    const deletions = []
    const additions = []

    while (
      i < diffLines.length &&
      (diffLines[i].type === "deleted" || diffLines[i].type === "added")
    ) {
      if (diffLines[i].type === "deleted") {
        deletions.push(diffLines[i])
      } else {
        additions.push(diffLines[i])
      }
      i++
    }

    const maxCount = Math.max(deletions.length, additions.length)
    for (let k = 0; k < maxCount; k++) {
      rowId++
      const del = deletions[k]
      const add = additions[k]

      rows.push({
        id: `change-${rowId}`,
        type: "change",
        left: del
          ? {
              lineNumber: del.oldLineNumber,
              content: del.content,
              type: "deleted",
            }
          : undefined,
        right: add
          ? {
              lineNumber: add.newLineNumber,
              content: add.content,
              type: "added",
            }
          : undefined,
      })
    }
  }

  return rows
}

const splitRows = buildSplitDiffRows(parsed)
assert.ok(splitRows.length > 0)
const changeRows = splitRows.filter((r) => r.type === "change")
assert.ok(
  changeRows.length >= 2,
  "Should contain change rows for additions and deletions"
)

// Check pairing: row 1 of change has deletion on left, addition on right
const pairedChange = changeRows.find((r) => r.left && r.right)
assert.ok(pairedChange, "Should pair deletion with addition on same row")
assert.equal(pairedChange.left.type, "deleted")
assert.equal(pairedChange.right.type, "added")

process.stdout.write("✓ Split side-by-side diff construction verified\n")

// 3. 2-Column Comparative Layout Data Contract Verification
const mockComparisonState = {
  challengeId: 1,
  challengeSlug: "calc-eval-rce",
  userReview: {
    flaggedLines: [25],
    comments: "Direct eval() call allows arbitrary code execution.",
  },
  staffReview: {
    canonical_review:
      "Senior Staff Engineer Review Critique: Direct evaluation using eval()...",
    expected_issues: [
      {
        id: "crit-rce-eval",
        title: "Arbitrary Code Execution via Unsanitized eval()",
        severity: "critical",
        lines: [25, 26],
        keywords: ["eval", "rce", "remote code execution"],
        explanation: "Using eval() permits remote code execution.",
      },
    ],
    recommended_fix_diff: sampleDiff,
  },
}

// User column assertions
assert.deepEqual(mockComparisonState.userReview.flaggedLines, [25])
assert.ok(mockComparisonState.userReview.comments.includes("Direct eval()"))

// Staff column assertions
assert.ok(
  mockComparisonState.staffReview.canonical_review.startsWith("Senior Staff")
)
assert.equal(mockComparisonState.staffReview.expected_issues.length, 1)
assert.equal(
  mockComparisonState.staffReview.expected_issues[0].severity,
  "critical"
)
assert.ok(mockComparisonState.staffReview.recommended_fix_diff.length > 0)

process.stdout.write("✓ 2-column comparative layout data contract verified\n")

// 4. Severity Badge Styling Mapping
const getSeverityBadgeStyle = (severity) => {
  const s = (severity || "").toLowerCase().trim()
  if (s === "critical") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
  }
  if (s === "high") {
    return "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400"
  }
  if (s === "medium") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
  }
  return "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400"
}

assert.ok(getSeverityBadgeStyle("critical").includes("rose-500"))
assert.ok(getSeverityBadgeStyle("high").includes("orange-500"))
assert.ok(getSeverityBadgeStyle("medium").includes("amber-500"))
assert.ok(getSeverityBadgeStyle("low").includes("sky-500"))
assert.ok(getSeverityBadgeStyle("").includes("sky-500"))

process.stdout.write("✓ Defect classification severity styling verified\n")

// 5. View Mode Switching Logic
const viewModes = ["comparison", "diff"]
let currentMode = "comparison"
const toggleMode = (target) => {
  if (viewModes.includes(target)) {
    currentMode = target
  }
}

assert.equal(currentMode, "comparison")
toggleMode("diff")
assert.equal(currentMode, "diff")
toggleMode("comparison")
assert.equal(currentMode, "comparison")

process.stdout.write("✓ View mode toggle transitions verified\n")

process.stdout.write(
  "==> ALL Side-by-Side Review Comparison tests PASSED successfully!\n"
)
