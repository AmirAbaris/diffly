import { parseUnifiedDiff } from "@/components/review/comparison/diff-parser"

/**
 * Extracts selectable new-side line numbers grouped by hunk so LineSpace
 * respects hunk boundaries and skips deleted-only line numbers.
 */
export function parsePatchSelectableLines(patch: string): number[][] {
  if (!patch) return []

  const parsed = parseUnifiedDiff(patch)
  const groups: number[][] = []
  let currentGroup: number[] = []

  for (const line of parsed) {
    if (line.type === "hunk") {
      if (currentGroup.length > 0) {
        groups.push(currentGroup)
        currentGroup = []
      }
      continue
    }

    if (
      (line.type === "context" || line.type === "added") &&
      typeof line.newLineNumber === "number"
    ) {
      currentGroup.push(line.newLineNumber)
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup)
  }

  return groups
}
