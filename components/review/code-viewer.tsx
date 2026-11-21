"use client"

import * as React from "react"
import { themes } from "prism-react-renderer"
import { useTheme } from "next-themes"
import {
  AnnotationProvider,
  useAnnotationLayer,
  type AnnotationLayer,
} from "@/components/review/annotations/annotation-layer"
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
import type { LineRef } from "@/lib/review"
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
      selectedFilePath?: string
      onSelectFilePath?: (path: string) => void
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

function useFallbackAnnotationLayer(
  flaggedLines: FlaggedLine[],
  onToggleLine: (line: FlaggedLine) => void,
  activeFilePath: string | null,
  readOnly: boolean
): AnnotationLayer {
  const listenersRef = React.useRef(new Set<() => void>())
  const flaggedSet = React.useMemo(
    () => collectFlaggedLineNumbers(flaggedLines, activeFilePath),
    [flaggedLines, activeFilePath]
  )
  const snapshotRef = React.useRef({ flaggedSet, activeFilePath, readOnly })

  React.useEffect(() => {
    snapshotRef.current = { flaggedSet, activeFilePath, readOnly }
    for (const listener of listenersRef.current) {
      listener()
    }
  }, [flaggedSet, activeFilePath, readOnly])

  return React.useMemo<AnnotationLayer>(
    () => ({
      mode: "draft",
      subscribe(listener) {
        listenersRef.current.add(listener)
        return () => {
          listenersRef.current.delete(listener)
        }
      },
      row(at: LineRef) {
        const isFlagged = at.file === activeFilePath && flaggedSet.has(at.line)
        return {
          tone: isFlagged ? "flagged" : "none",
          rangeEdge: isFlagged ? "single" : null,
          isCursor: false,
          isPendingSelection: false,
          hasThread: false,
          label: isFlagged ? "Flagged" : `Line ${at.line}`,
          interactive: !readOnly,
        }
      },
      threadAfter() {
        return null
      },
      activate(at: LineRef) {
        if (readOnly) return
        onToggleLine(
          at.file !== null
            ? { file_path: at.file, line_number: at.line }
            : at.line
        )
      },
    }),
    [flaggedSet, activeFilePath, onToggleLine, readOnly]
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
  selectedFilePath: controlledFilePath,
  onSelectFilePath,
  className,
  readOnly = false,
}: ReadyCodeViewerProps) {
  const { resolvedTheme } = useTheme()
  const mounted = useMounted()
  const { copied, copy } = useClipboard()
  const parentLayer = useAnnotationLayer()
  const [internalFilePath, setInternalFilePath] = React.useState<string>(
    () => files?.[0]?.path ?? ""
  )
  const [diffMode, setDiffMode] = React.useState<"unified" | "split">(
    defaultDiffMode
  )

  const selectedFilePath = controlledFilePath ?? internalFilePath
  const setSelectedFilePath = React.useCallback(
    (path: string) => {
      if (onSelectFilePath) {
        onSelectFilePath(path)
      } else {
        setInternalFilePath(path)
      }
    },
    [onSelectFilePath]
  )

  const activeFile = React.useMemo(() => {
    if (!files || files.length === 0) return null
    return files.find((f) => f.path === selectedFilePath) ?? files[0]
  }, [files, selectedFilePath])

  const activeFilePath = activeFile?.path ?? null
  const fallbackLayer = useFallbackAnnotationLayer(
    flaggedLines,
    onToggleLine,
    activeFilePath,
    readOnly
  )

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

  const handleCopy = React.useCallback(() => {
    void copy(copyPayload)
  }, [copy, copyPayload])

  const currentTheme =
    mounted && resolvedTheme === "light" ? themes.vsLight : themes.vsDark

  const content = activePatch ? (
    <DiffHunkView
      patch={activePatch}
      filePath={activeFilePath}
      normalizedLanguage={normalizedLanguage}
      theme={currentTheme}
      diffMode={diffMode}
      readOnly={readOnly}
    />
  ) : (
    <CodeLinesView
      code={activeCode}
      filePath={activeFilePath}
      normalizedLanguage={normalizedLanguage}
      theme={currentTheme}
      readOnly={readOnly}
    />
  )

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

      {parentLayer ? (
        content
      ) : (
        <AnnotationProvider layer={fallbackLayer}>{content}</AnnotationProvider>
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
