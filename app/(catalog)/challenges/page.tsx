import type { Metadata } from "next"
import Link from "next/link"
import * as React from "react"
import { Suspense } from "react"
import { ArrowRight } from "lucide-react"
import { CatalogSkeletonGrid } from "@/components/challenges/catalog-grid"
import { ChallengeCatalog } from "@/components/challenges/challenge-catalog"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Challenges",
  description:
    "Practice code reviews on AI agent antipatterns, security vulnerabilities, and concurrency defects.",
}

export const instant = false

export default function ChallengesPage() {
  return (
    <main className="px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-balance text-foreground">
              Challenge Catalog
            </h1>
            <p className="text-sm text-pretty text-muted-foreground">
              Practice code reviews on AI agent antipatterns, security
              vulnerabilities, and concurrency defects.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            asChild
            className="w-fit shrink-0"
            data-testid="challenges-open-coach-button"
          >
            <Link href="/coach">
              <span>Agent Coach</span>
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <Suspense fallback={<CatalogSkeletonGrid />}>
          <ChallengeCatalog />
        </Suspense>
      </div>
    </main>
  )
}
