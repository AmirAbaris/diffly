export interface ParsedDiffLine {
  id: string
  type: "header" | "hunk" | "context" | "added" | "deleted"
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

export interface SplitDiffRow {
  id: string
  type: "hunk" | "change" | "context"
  hunkHeader?: string
  left?: {
    lineNumber?: number
    content: string
    type: "deleted" | "context"
  }
  right?: {
    lineNumber?: number
    content: string
    type: "added" | "context"
  }
}

/**
 * Parses a standard unified git diff into structured lines with line numbering.
 */
export function parseUnifiedDiff(rawDiff: string): ParsedDiffLine[] {
  if (!rawDiff) return []

  const lines = rawDiff.split("\n")
  const parsed: ParsedDiffLine[] = []

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

/**
 * Converts unified diff lines into aligned rows for side-by-side (Before vs After) display.
 */
export function buildSplitDiffRows(
  diffLines: ParsedDiffLine[]
): SplitDiffRow[] {
  const rows: SplitDiffRow[] = []
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

    const deletions: ParsedDiffLine[] = []
    const additions: ParsedDiffLine[] = []

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
