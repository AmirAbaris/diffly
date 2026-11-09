import type { Metadata } from "next"
import * as React from "react"
import { Suspense } from "react"
import { CatalogSkeletonGrid } from "@/components/challenges/catalog-grid"
import { ChallengeCatalog } from "@/components/challenges/challenge-catalog"

export const metadata: Metadata = {
  title: "Challenges",
  description:
    "Practice code reviews on AI agent antipatterns, security vulnerabilities, and concurrency defects.",
}

export default function ChallengesPage() {
  return (
    <main className="p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">
            Challenge Catalog
          </h1>
          <p className="text-sm text-muted-foreground">
            Practice code reviews on AI agent antipatterns, security
            vulnerabilities, and concurrency defects.
          </p>
        </div>

        <Suspense fallback={<CatalogSkeletonGrid />}>
          <ChallengeCatalog />
        </Suspense>
      </div>
    </main>
  )
}
