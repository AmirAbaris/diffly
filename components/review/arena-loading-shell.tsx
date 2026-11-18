import * as React from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { CodeViewer } from "@/components/review/code-viewer"
import { ChallengeContextPanelSkeleton } from "@/components/review/context-panel/context-panel-skeleton"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface ArenaLoadingShellProps {
  className?: string
}

/**
 * Pure presentational loading shell shared by RSC <Suspense> and ArenaLayout.
 */
export function ArenaLoadingShell({ className }: ArenaLoadingShellProps) {
  return (
    <div
      data-testid="arena-loading-shell"
      className={cn(
        "flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground",
        className
      )}
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <Link href="/challenges">
              <ArrowLeft aria-hidden="true" className="size-3.5" />
              <span className="font-medium">Catalog</span>
            </Link>
          </Button>

          <span aria-hidden="true" className="text-sm text-border select-none">
            /
          </span>

          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="hidden h-5 w-20 sm:block" />
            <Skeleton className="h-5 w-14" />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <div className="hidden h-4 w-px bg-border sm:block" />
          <Skeleton className="size-8 rounded-full" />
        </div>
      </header>

      <div className="flex shrink-0 border-b border-border bg-muted/20 px-4 py-2 lg:hidden">
        <Skeleton className="h-9 w-full rounded-md" />
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          aria-label="Loading Scenario Context"
          className="hidden min-h-0 flex-col overflow-y-auto border-border bg-card/30 lg:flex lg:w-[42%] lg:border-r xl:w-[40%]"
        >
          <ChallengeContextPanelSkeleton />
        </aside>

        <main
          aria-label="Loading Code Viewer"
          className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background p-4 sm:p-6 lg:w-[58%] xl:w-[60%]"
        >
          <div className="flex flex-col gap-4">
            <CodeViewer status="loading" lineCountHint={16} />

            <div
              data-testid="arena-comment-drawer-loading"
              className="flex flex-col rounded-lg border border-border bg-card shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="size-6 rounded" />
              </div>
              <div className="flex flex-col gap-3 p-4">
                <Skeleton className="h-24 w-full rounded-md" />
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-8 w-24 rounded-md" />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <div
        data-testid="submission-bar-loading"
        className="sticky bottom-0 z-20 flex w-full shrink-0 items-center justify-between border-t border-border bg-card/95 px-4 py-2.5 backdrop-blur-md sm:px-6"
      >
        <Skeleton className="h-4 w-40" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </div>
    </div>
  )
}
