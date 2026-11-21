"use client"

import * as React from "react"
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  Folder,
  FolderTree,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getFileBaseName } from "@/lib/flagged-lines"
import { cn } from "@/lib/utils"

export interface PrFileSummary {
  path: string
  language: string
  additions: number
  deletions: number
  lineCount: number
  isPatch: boolean
  flaggedCount: number
}

export interface PrFileTreeProps {
  files: PrFileSummary[]
  activeFilePath: string
  onSelectFile: (filePath: string) => void
}

interface DirectoryGroup {
  dir: string
  items: PrFileSummary[]
}

function groupFilesByDirectory(files: PrFileSummary[]): DirectoryGroup[] {
  const map = new Map<string, PrFileSummary[]>()
  for (const file of files) {
    const slashIdx = file.path.lastIndexOf("/")
    const dir = slashIdx === -1 ? "" : file.path.slice(0, slashIdx)
    const list = map.get(dir)
    if (list) {
      list.push(file)
    } else {
      map.set(dir, [file])
    }
  }
  return Array.from(map.entries()).map(([dir, items]) => ({ dir, items }))
}

export function PrFileTree({
  files,
  activeFilePath,
  onSelectFile,
}: PrFileTreeProps) {
  const [isTreeExpanded, setIsTreeExpanded] = React.useState(true)

  const totalAdditions = React.useMemo(
    () => files.reduce((sum, f) => sum + f.additions, 0),
    [files]
  )
  const totalDeletions = React.useMemo(
    () => files.reduce((sum, f) => sum + f.deletions, 0),
    [files]
  )
  const groups = React.useMemo(() => groupFilesByDirectory(files), [files])

  if (files.length <= 1) {
    return null
  }

  return (
    <div
      data-testid="pr-file-switcher"
      className="flex flex-col border-b border-border bg-muted/20"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
        <div className="flex items-center gap-2 font-sans text-xs">
          <FolderTree
            aria-hidden="true"
            className="size-3.5 text-muted-foreground"
          />
          <span className="font-medium text-foreground tabular-nums">
            Files changed ({files.length})
          </span>
          {(totalAdditions > 0 || totalDeletions > 0) && (
            <span className="flex items-center gap-1.5 font-mono text-xs tabular-nums">
              {totalAdditions > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  +{totalAdditions}
                </span>
              )}
              {totalDeletions > 0 && (
                <span className="text-rose-600 dark:text-rose-400">
                  -{totalDeletions}
                </span>
              )}
            </span>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setIsTreeExpanded((prev) => !prev)}
          aria-expanded={isTreeExpanded}
          data-testid="pr-file-tree-toggle"
          className="gap-1 font-sans text-muted-foreground hover:text-foreground"
        >
          {isTreeExpanded ? (
            <>
              <ChevronDown aria-hidden="true" data-icon="inline-start" />
              <span>Hide tree</span>
            </>
          ) : (
            <>
              <ChevronRight aria-hidden="true" data-icon="inline-start" />
              <span>Show tree</span>
            </>
          )}
        </Button>
      </div>

      <div
        role="tablist"
        aria-label="Pull request file tabs"
        className="flex items-center gap-1 overflow-x-auto border-t border-border/60 px-2 py-1.5"
      >
        {files.map((file) => {
          const isActive = file.path === activeFilePath
          const baseName = getFileBaseName(file.path)
          return (
            <button
              key={file.path}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`pr-file-tab-${file.path}`}
              title={file.path}
              onClick={() => onSelectFile(file.path)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                isActive
                  ? "border-border bg-background font-semibold text-foreground shadow-xs"
                  : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <FileCode aria-hidden="true" className="size-3 shrink-0" />
              <span>{baseName}</span>
              {file.flaggedCount > 0 && (
                <Badge
                  variant="warning"
                  size="sm"
                  className="h-4 px-1 text-[10px] tabular-nums"
                >
                  {file.flaggedCount}
                </Badge>
              )}
            </button>
          )
        })}
      </div>

      {isTreeExpanded && (
        <div
          data-testid="pr-file-tree"
          className="max-h-40 overflow-y-auto border-t border-border/60 bg-background/50 px-2 py-1.5"
        >
          <div className="flex flex-col gap-1">
            {groups.map((group) => (
              <div key={group.dir || "root"} className="flex flex-col gap-0.5">
                {group.dir && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                    <Folder aria-hidden="true" className="size-3 shrink-0" />
                    <span className="truncate">{group.dir}/</span>
                  </div>
                )}
                {group.items.map((file) => {
                  const isActive = file.path === activeFilePath
                  const baseName = getFileBaseName(file.path)
                  return (
                    <button
                      key={file.path}
                      type="button"
                      data-testid={`pr-file-tree-item-${file.path}`}
                      aria-current={isActive ? "true" : undefined}
                      title={file.path}
                      onClick={() => onSelectFile(file.path)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left font-mono text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        group.dir && "pl-5",
                        isActive
                          ? "bg-accent font-semibold text-accent-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <FileCode
                          aria-hidden="true"
                          className="size-3.5 shrink-0"
                        />
                        <span className="truncate">{baseName}</span>
                      </span>

                      <span className="flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums">
                        {file.flaggedCount > 0 && (
                          <Badge
                            variant="warning"
                            size="sm"
                            className="h-4 px-1 text-[10px]"
                          >
                            {file.flaggedCount}
                          </Badge>
                        )}
                        {file.isPatch ? (
                          <>
                            <span className="text-emerald-600 dark:text-emerald-400">
                              +{file.additions}
                            </span>
                            <span className="text-rose-600 dark:text-rose-400">
                              -{file.deletions}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            {file.lineCount}L
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
