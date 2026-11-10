import * as React from "react"
import { CatalogSkeletonGrid } from "@/components/challenges/catalog-grid"
import { Skeleton } from "@/components/ui/skeleton"

export default function ChallengesLoading() {
  return (
    <main className="p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>

        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-72" />
        </div>

        <CatalogSkeletonGrid />
      </div>
    </main>
  )
}
