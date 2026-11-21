import type { ChallengeFile } from "@/types/challenge"
import { MAX_ANCHOR_SPAN, type Anchor, type LineRef } from "./model"
import { parsePatchSelectableLines } from "./patch-rows"

export interface LineSpace {
  readonly files: readonly (string | null)[]
  isFlaggable(at: LineRef): boolean
  next(at: LineRef): LineRef | null
  prev(at: LineRef): LineRef | null
  contiguousAnchor(from: LineRef, to: LineRef): Anchor
}

interface FileIndex {
  readonly file: string | null
  readonly groups: readonly (readonly number[])[]
  readonly flatLines: readonly number[]
  readonly lineToGroupIndex: ReadonlyMap<number, number>
}

function countContentLines(content: string): number {
  if (content.length === 0) return 0
  return content.replace(/\r\n/g, "\n").split("\n").length
}

function buildFileIndex(file: string | null, groups: number[][]): FileIndex {
  const flatLines: number[] = []
  const lineToGroupIndex = new Map<number, number>()

  for (let gIdx = 0; gIdx < groups.length; gIdx++) {
    for (const line of groups[gIdx]) {
      flatLines.push(line)
      lineToGroupIndex.set(line, gIdx)
    }
  }

  return { file, groups, flatLines, lineToGroupIndex }
}

function clampToSpan(
  fromLine: number,
  targetLine: number,
  group: readonly number[]
): { start: number; end: number } {
  const groupStart = group[0]
  const groupEnd = group[group.length - 1]
  const maxForward = fromLine + MAX_ANCHOR_SPAN - 1
  const maxBackward = fromLine - (MAX_ANCHOR_SPAN - 1)

  if (targetLine >= fromLine) {
    const clampedEnd = Math.min(targetLine, groupEnd, maxForward)
    return { start: fromLine, end: clampedEnd }
  }

  const clampedStart = Math.max(targetLine, groupStart, maxBackward)
  return { start: clampedStart, end: fromLine }
}

export function buildLineSpace(input: {
  code?: string | null
  files?: readonly ChallengeFile[] | null
}): LineSpace {
  const fileIndices: FileIndex[] = []
  const fileLookup = new Map<string | null, number>()

  if (input.files && input.files.length > 0) {
    for (const file of input.files) {
      let groups: number[][] = []
      if (typeof file.patch === "string" && file.patch.length > 0) {
        groups = parsePatchSelectableLines(file.patch)
      } else if (typeof file.content === "string" && file.content.length > 0) {
        const count = countContentLines(file.content)
        if (count > 0) {
          groups = [Array.from({ length: count }, (_, idx) => idx + 1)]
        }
      }

      if (!fileLookup.has(file.path)) {
        fileLookup.set(file.path, fileIndices.length)
        fileIndices.push(buildFileIndex(file.path, groups))
      }
    }
  } else if (typeof input.code === "string" && input.code.length > 0) {
    const count = countContentLines(input.code)
    const groups =
      count > 0 ? [Array.from({ length: count }, (_, idx) => idx + 1)] : []
    fileLookup.set(null, 0)
    fileIndices.push(buildFileIndex(null, groups))
  }

  const files = fileIndices.map((entry) => entry.file)

  return {
    files,

    isFlaggable(at: LineRef): boolean {
      const idx = fileLookup.get(at.file)
      if (idx === undefined) return false
      return fileIndices[idx].lineToGroupIndex.has(at.line)
    },

    next(at: LineRef): LineRef | null {
      const startFileIdx = fileLookup.get(at.file)
      if (startFileIdx === undefined) return null

      const currentFile = fileIndices[startFileIdx]
      for (const line of currentFile.flatLines) {
        if (line > at.line) {
          return { file: currentFile.file, line }
        }
      }

      for (let fIdx = startFileIdx + 1; fIdx < fileIndices.length; fIdx++) {
        const nextFile = fileIndices[fIdx]
        if (nextFile.flatLines.length > 0) {
          return { file: nextFile.file, line: nextFile.flatLines[0] }
        }
      }

      return null
    },

    prev(at: LineRef): LineRef | null {
      const startFileIdx = fileLookup.get(at.file)
      if (startFileIdx === undefined) return null

      const currentFile = fileIndices[startFileIdx]
      for (let i = currentFile.flatLines.length - 1; i >= 0; i--) {
        const line = currentFile.flatLines[i]
        if (line < at.line) {
          return { file: currentFile.file, line }
        }
      }

      for (let fIdx = startFileIdx - 1; fIdx >= 0; fIdx--) {
        const prevFile = fileIndices[fIdx]
        if (prevFile.flatLines.length > 0) {
          const last = prevFile.flatLines[prevFile.flatLines.length - 1]
          return { file: prevFile.file, line: last }
        }
      }

      return null
    },

    contiguousAnchor(from: LineRef, to: LineRef): Anchor {
      const fromFileIdx = fileLookup.get(from.file)
      if (fromFileIdx === undefined) {
        return { file: from.file, start: from.line, end: from.line }
      }

      const fileEntry = fileIndices[fromFileIdx]
      const groupIdx = fileEntry.lineToGroupIndex.get(from.line)
      if (groupIdx === undefined) {
        return { file: from.file, start: from.line, end: from.line }
      }

      const group = fileEntry.groups[groupIdx]
      let targetLine = to.line

      if (to.file !== from.file) {
        const toFileIdx = fileLookup.get(to.file)
        if (toFileIdx === undefined) {
          targetLine = from.line
        } else if (toFileIdx > fromFileIdx) {
          targetLine = group[group.length - 1]
        } else {
          targetLine = group[0]
        }
      } else {
        const toGroupIdx = fileEntry.lineToGroupIndex.get(to.line)
        if (toGroupIdx !== undefined && toGroupIdx !== groupIdx) {
          targetLine =
            toGroupIdx > groupIdx ? group[group.length - 1] : group[0]
        }
      }

      const { start, end } = clampToSpan(from.line, targetLine, group)
      return { file: from.file, start, end }
    },
  }
}

/**
 * Permissive fallback LineSpace used only when a legacy caller invokes
 * useReviewDraft without supplying a challenge LineSpace.
 */
export function buildUnboundedLineSpace(): LineSpace {
  return {
    files: [],
    isFlaggable: (at) => Number.isInteger(at.line) && at.line >= 1,
    next: (at) => ({ file: at.file, line: at.line + 1 }),
    prev: (at) => (at.line > 1 ? { file: at.file, line: at.line - 1 } : null),
    contiguousAnchor: (from, to) => {
      if (to.file !== from.file) {
        return { file: from.file, start: from.line, end: from.line }
      }
      if (to.line >= from.line) {
        return {
          file: from.file,
          start: from.line,
          end: Math.min(to.line, from.line + MAX_ANCHOR_SPAN - 1),
        }
      }
      return {
        file: from.file,
        start: Math.max(1, to.line, from.line - (MAX_ANCHOR_SPAN - 1)),
        end: from.line,
      }
    },
  }
}
