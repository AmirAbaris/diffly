"use client"

import * as React from "react"
import { themes } from "prism-react-renderer"
import { useTheme } from "next-themes"
import { CodeLinesView } from "@/components/review/code-viewer/code-lines-view"
import { CodeViewerHeader } from "@/components/review/code-viewer/code-viewer-header"
import { CodeViewerSkeleton } from "@/components/review/code-viewer/code-viewer-skeleton"
import { DiffHunkView } from "@/components/review/code-viewer/diff-hunk-views"
import { resolveCodeFileName } from "@/components/review/code-viewer/language"
import { PrFileTree } from "@/components/review/code-viewer/pr-file-tree"
import {
  buildPrFileSummaries,
  collectFlaggedLineNumbers,
  resolveActiveFileLanguage,
} from "@/components/review/code-viewer/pr-file-utils"
import { useClipboard } from "@/hooks/use-clipboard"
import { cn } from "@/lib/utils"
import type { ChallengeFile, FlaggedLine, Language } from "@/types/challenge"

export type CodeViewerProps =
  | {
      status: "loading"
      fileName?: string
      lineCountHint?: number
      className?: string
    }
  | {
      status?: "ready"
      code?: string
      files?: ChallengeFile[]
      language?: Language | string
      flaggedLines: FlaggedLine[]
      onToggleLine: (line: FlaggedLine) => void
      onOpenGuide?: () => void
      fileName?: string
      defaultDiffMode?: "unified" | "split"
      className?: string
      readOnly?: boolean
    }

type ReadyCodeViewerProps = Exclude<CodeViewerProps, { status: "loading" }>

const emptySubscribe = () => () => {}

function useMounted() {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )
}

function ReadyCodeViewer({
  code = "",
  files,
  language = "python",
  flaggedLines,
  onToggleLine,
  onOpenGuide,
  fileName,
  defaultDiffMode = "unified",
  className,
  readOnly = false,
}: ReadyCodeViewerProps) {
  const { resolvedTheme } = useTheme()
  const mounted = useMounted()
  const { copied, copy } = useClipboard()
  const [selectedFilePath, setSelectedFilePath] = React.useState<string>(
    () => files?.[0]?.path ?? ""
  )
  const [diffMode, setDiffMode] = React.useState<"unified" | "split">(
    defaultDiffMode
  )

  const activeFile = React.useMemo(() => {
    if (!files || files.length === 0) return null
    return files.find((f) => f.path === selectedFilePath) ?? files[0]
  }, [files, selectedFilePath])

  const fileSummaries = React.useMemo(
    () => buildPrFileSummaries(files, flaggedLines),
    [files, flaggedLines]
  )

  const normalizedLanguage = React.useMemo(
    () => resolveActiveFileLanguage(activeFile, String(language)),
    [activeFile, language]
  )

  const resolvedFileName = activeFile
    ? activeFile.path
    : resolveCodeFileName(normalizedLanguage, fileName)

  const activePatch = activeFile?.patch ?? null
  const rawCode = activeFile ? (activeFile.content ?? "") : code
  const activeCode = rawCode.replace(/\r?\n$/, "")
  const copyPayload = activePatch ?? rawCode

  const activeFileStats = React.useMemo(
    () => fileSummaries.find((item) => item.path === activeFile?.path) ?? null,
    [activeFile, fileSummaries]
  )

  const flaggedLineNumbers = React.useMemo(
    () => collectFlaggedLineNumbers(flaggedLines, activeFile?.path ?? null),
    [flaggedLines, activeFile]
  )

  const handleToggleLineNumber = React.useCallback(
    (lineNumber: number) => {
      onToggleLine(
        activeFile
          ? { file_path: activeFile.path, line_number: lineNumber }
          : lineNumber
      )
    },
    [activeFile, onToggleLine]
  )

  const handleCopy = React.useCallback(() => {
    void copy(copyPayload)
  }, [copy, copyPayload])

  const currentTheme =
    mounted && resolvedTheme === "light" ? themes.vsLight : themes.vsDark

  return (
    <div
      data-testid="code-viewer"
      className={cn(
        "flex flex-col rounded-lg border border-border bg-muted/20 font-mono text-xs",
        className
      )}
    >
      <CodeViewerHeader
        fileName={resolvedFileName}
        normalizedLanguage={normalizedLanguage}
        hasPatch={Boolean(activePatch)}
        activeFileStats={activeFileStats}
        codeLineCount={activeCode ? activeCode.split("\n").length : 0}
        diffMode={diffMode}
        onDiffModeChange={setDiffMode}
        flaggedCount={flaggedLines.length}
        copied={copied}
        onCopy={handleCopy}
        onOpenGuide={onOpenGuide}
      />

      {activeFile && (
        <PrFileTree
          files={fileSummaries}
          activeFilePath={activeFile.path}
          onSelectFile={setSelectedFilePath}
        />
      )}

      {activePatch ? (
        <DiffHunkView
          patch={activePatch}
          normalizedLanguage={normalizedLanguage}
          theme={currentTheme}
          diffMode={diffMode}
          flaggedLineNumbers={flaggedLineNumbers}
          onToggleLineNumber={handleToggleLineNumber}
          readOnly={readOnly}
        />
      ) : (
        <CodeLinesView
          code={activeCode}
          normalizedLanguage={normalizedLanguage}
          theme={currentTheme}
          flaggedLineNumbers={flaggedLineNumbers}
          onToggleLineNumber={handleToggleLineNumber}
          readOnly={readOnly}
        />
      )}
    </div>
  )
}

export function CodeViewer(props: CodeViewerProps) {
  if (props.status === "loading") {
    return (
      <CodeViewerSkeleton
        fileName={props.fileName}
        lineCountHint={props.lineCountHint}
        className={props.className}
      />
    )
  }

  return <ReadyCodeViewer {...props} />
}
