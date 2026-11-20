import type { FlaggedLine, FlaggedLineRef } from "@/types/challenge"

export function isFlaggedLineRef(item: FlaggedLine): item is FlaggedLineRef {
  return typeof item === "object" && item !== null && "file_path" in item
}

export function isSameFlaggedLine(a: FlaggedLine, b: FlaggedLine): boolean {
  if (typeof a === "number" && typeof b === "number") {
    return a === b
  }
  if (isFlaggedLineRef(a) && isFlaggedLineRef(b)) {
    return a.file_path === b.file_path && a.line_number === b.line_number
  }
  return false
}

export function flaggedLineKey(item: FlaggedLine): string {
  if (typeof item === "number") {
    return `line-${item}`
  }
  return `file-${item.file_path}:${item.line_number}`
}

export function getFileBaseName(filePath: string): string {
  const parts = filePath.split("/")
  return parts[parts.length - 1] || filePath
}

export function formatFlaggedLineBadge(item: FlaggedLine): string {
  if (typeof item === "number") {
    return `L${item}`
  }
  return `${getFileBaseName(item.file_path)}:L${item.line_number}`
}

export function formatFlaggedLineLabel(item: FlaggedLine): string {
  if (typeof item === "number") {
    return `Line ${item}`
  }
  return `${item.file_path}:${item.line_number}`
}

export function formatFlaggedLineList(items?: FlaggedLine[]): string | null {
  if (!items || items.length === 0) {
    return null
  }
  return items
    .map((item) =>
      typeof item === "number"
        ? String(item)
        : `${item.file_path}:${item.line_number}`
    )
    .join(", ")
}

export function sortFlaggedLines(items: FlaggedLine[]): FlaggedLine[] {
  return items.slice().sort((a, b) => {
    if (typeof a === "number" && typeof b === "number") {
      return a - b
    }
    if (typeof a === "number") {
      return -1
    }
    if (typeof b === "number") {
      return 1
    }
    const pathCmp = a.file_path.localeCompare(b.file_path)
    return pathCmp !== 0 ? pathCmp : a.line_number - b.line_number
  })
}

export function isLineFlagged(
  items: FlaggedLine[],
  lineNumber: number,
  filePath?: string
): boolean {
  if (filePath) {
    return items.some(
      (item) =>
        isFlaggedLineRef(item) &&
        item.file_path === filePath &&
        item.line_number === lineNumber
    )
  }
  return items.some((item) => typeof item === "number" && item === lineNumber)
}

export function countFlaggedLinesInFile(
  items: FlaggedLine[],
  filePath: string
): number {
  let count = 0
  for (const item of items) {
    if (isFlaggedLineRef(item) && item.file_path === filePath) {
      count += 1
    }
  }
  return count
}

export function normalizeStoredFlaggedLines(raw: unknown): FlaggedLine[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const result: FlaggedLine[] = []
  for (const item of raw) {
    if (typeof item === "number" && Number.isInteger(item) && item > 0) {
      result.push(item)
      continue
    }
    if (typeof item === "object" && item !== null) {
      const candidate = item as { file_path?: unknown; line_number?: unknown }
      if (
        typeof candidate.file_path === "string" &&
        candidate.file_path.trim().length > 0 &&
        typeof candidate.line_number === "number" &&
        Number.isInteger(candidate.line_number) &&
        candidate.line_number > 0
      ) {
        result.push({
          file_path: candidate.file_path.trim(),
          line_number: candidate.line_number,
        })
      }
    }
  }
  return result
}
