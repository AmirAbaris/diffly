import {
  inferLanguageFromPath,
  normalizeCodeLanguage,
} from "@/components/review/code-viewer/language"

export interface ParsedDiffLine {
  id: string
  type: "header" | "hunk" | "context" | "added" | "deleted"
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

export interface ParsedDiffFile {
  id: string
  filePath: string
  language: string
  lines: ParsedDiffLine[]
  additions: number
  deletions: number
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

  const normalizedDiff = rawDiff.replace(/\r\n/g, "\n")
  const hasHunkHeaders = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m.test(
    normalizedDiff
  )
  const lines = normalizedDiff.split("\n")
  const parsed: ParsedDiffLine[] = []

  let oldCounter = hasHunkHeaders ? 0 : 1
  let newCounter = hasHunkHeaders ? 0 : 1
  let inHunk = !hasHunkHeaders

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]
    if (idx === lines.length - 1 && line === "") {
      continue
    }
    const lineId = `diff-line-${idx + 1}`

    if (line.startsWith("diff --git ") || line.startsWith("index ")) {
      if (hasHunkHeaders) inHunk = false
      parsed.push({ id: lineId, type: "header", content: line })
      continue
    }

    if (
      line.startsWith("--- a/") ||
      line.startsWith("+++ b/") ||
      line.startsWith("--- /dev/null") ||
      line.startsWith("+++ /dev/null") ||
      (!inHunk && (line.startsWith("--- ") || line.startsWith("+++ ")))
    ) {
      if (hasHunkHeaders) inHunk = false
      parsed.push({ id: lineId, type: "header", content: line })
      continue
    }

    if (line.startsWith("\\ No newline")) {
      continue
    }

    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunkMatch) {
      inHunk = true
      oldCounter = parseInt(hunkMatch[1], 10)
      newCounter = parseInt(hunkMatch[2], 10)
      parsed.push({ id: lineId, type: "hunk", content: line })
      continue
    }

    if (!inHunk) {
      parsed.push({ id: lineId, type: "header", content: line })
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

export function computeDiffStats(lines: ParsedDiffLine[]): {
  additions: number
  deletions: number
} {
  let additions = 0
  let deletions = 0
  for (const line of lines) {
    if (line.type === "added") additions += 1
    else if (line.type === "deleted") deletions += 1
  }
  return { additions, deletions }
}

function extractPathFromDiffHeader(line: string): string {
  const trimmed = line.slice(4).trim()
  if (trimmed === "/dev/null") return ""
  if (trimmed.startsWith("a/") || trimmed.startsWith("b/")) {
    return trimmed.slice(2)
  }
  return trimmed
}

/**
 * Splits a multi-file unified diff string into per-file sections with stats.
 */
export function parseMultiFileUnifiedDiff(
  rawDiff: string,
  fallbackLanguage = "python"
): ParsedDiffFile[] {
  if (!rawDiff) return []

  const rawLines = rawDiff.split("\n")
  const chunks: Array<{ filePath: string; rawLines: string[] }> = []
  let current: { filePath: string; rawLines: string[] } | null = null

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]

    if (line.startsWith("diff --git ")) {
      const match = line.match(/^diff --git a\/.+ b\/(.+)$/)
      const path = match ? match[1].trim() : ""
      current = { filePath: path, rawLines: [line] }
      chunks.push(current)
      continue
    }

    const isFileStart =
      (line.startsWith("--- a/") || line.startsWith("--- /dev/null")) &&
      i + 1 < rawLines.length &&
      (rawLines[i + 1].startsWith("+++ b/") ||
        rawLines[i + 1].startsWith("+++ /dev/null"))

    if (isFileStart) {
      const nextLine = rawLines[i + 1]
      const newPath = extractPathFromDiffHeader(nextLine)
      const oldPath = extractPathFromDiffHeader(line)
      const resolvedPath = newPath || oldPath

      if (!current || current.rawLines.some((l) => l.startsWith("@@"))) {
        current = { filePath: resolvedPath, rawLines: [line] }
        chunks.push(current)
      } else {
        if (!current.filePath && resolvedPath) {
          current.filePath = resolvedPath
        }
        current.rawLines.push(line)
      }
      continue
    }

    if (!current) {
      current = { filePath: "", rawLines: [] }
      chunks.push(current)
    }

    if (
      !current.filePath &&
      (line.startsWith("+++ b/") || line.startsWith("+++ "))
    ) {
      const candidate = extractPathFromDiffHeader(line)
      if (candidate) {
        current.filePath = candidate
      }
    }

    current.rawLines.push(line)
  }

  return chunks
    .map((chunk, idx) => {
      const parsedLines = parseUnifiedDiff(chunk.rawLines.join("\n"))
      const stats = computeDiffStats(parsedLines)
      const inferredLang = normalizeCodeLanguage(
        inferLanguageFromPath(chunk.filePath, fallbackLanguage)
      )
      return {
        id: chunk.filePath || `file-${idx + 1}`,
        filePath: chunk.filePath || `File ${idx + 1}`,
        language: inferredLang,
        lines: parsedLines,
        additions: stats.additions,
        deletions: stats.deletions,
      }
    })
    .filter((file) => file.lines.length > 0)
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
