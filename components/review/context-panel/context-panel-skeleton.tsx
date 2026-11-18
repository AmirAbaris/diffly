import * as React from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export function ChallengeContextPanelSkeleton({
  className,
}: {
  className?: string
}) {
  return (
    <div
      data-testid="challenge-context-panel-loading"
      className={cn("flex flex-col gap-6 p-4 sm:p-6", className)}
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    </div>
  )
}
