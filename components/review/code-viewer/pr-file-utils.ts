import {
  inferLanguageFromPath,
  normalizeCodeLanguage,
} from "@/components/review/code-viewer/language"
import type { PrFileSummary } from "@/components/review/code-viewer/pr-file-tree"
import {
  computeDiffStats,
  parseUnifiedDiff,
} from "@/components/review/comparison/diff-parser"
import { countFlaggedLinesInFile, isFlaggedLineRef } from "@/lib/flagged-lines"
import type { ChallengeFile, FlaggedLine } from "@/types/challenge"

export function trimTrailingNewline(text: string): string {
  return text.replace(/\r?\n$/, "")
}

export function buildPrFileSummaries(
  files: ChallengeFile[] | undefined,
  flaggedLines: FlaggedLine[]
): PrFileSummary[] {
  if (!files || files.length === 0) return []
  return files.map((file) => {
    const isPatch = Boolean(file.patch)
    const parsed = isPatch ? parseUnifiedDiff(file.patch ?? "") : []
    const stats = isPatch
      ? computeDiffStats(parsed)
      : { additions: 0, deletions: 0 }
    const cleanContent = trimTrailingNewline(file.content ?? "")
    const bodyLineCount = isPatch
      ? parsed.filter((l) => l.type !== "header" && l.type !== "hunk").length
      : cleanContent
        ? cleanContent.split("\n").length
        : 0
    return {
      path: file.path,
      language: file.language || inferLanguageFromPath(file.path),
      additions: stats.additions,
      deletions: stats.deletions,
      lineCount: bodyLineCount,
      isPatch,
      flaggedCount: countFlaggedLinesInFile(flaggedLines, file.path),
    }
  })
}

export function resolveActiveFileLanguage(
  activeFile: ChallengeFile | null,
  fallbackLanguage: string
): string {
  if (!activeFile) {
    return normalizeCodeLanguage(fallbackLanguage)
  }
  const raw =
    activeFile.language ||
    inferLanguageFromPath(activeFile.path, fallbackLanguage)
  return normalizeCodeLanguage(raw)
}

export function collectFlaggedLineNumbers(
  flaggedLines: FlaggedLine[],
  activeFilePath: string | null
): Set<number> {
  const set = new Set<number>()
  for (const item of flaggedLines) {
    if (activeFilePath !== null) {
      if (isFlaggedLineRef(item) && item.file_path === activeFilePath) {
        set.add(item.line_number)
      }
    } else if (typeof item === "number") {
      set.add(item)
    }
  }
  return set
}
