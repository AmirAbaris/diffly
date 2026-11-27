import type { Metadata } from "next"
import * as React from "react"
import { Suspense } from "react"
import { LeaderboardSkeleton } from "@/components/leaderboard/leaderboard-skeleton"
import { LeaderboardView } from "@/components/leaderboard/leaderboard-view"

export const metadata: Metadata = {
  title: "Leaderboard",
  description:
    "Top code reviewers on Diffly ranked by difficulty-weighted challenge scores.",
}

export const instant = false

export default function LeaderboardPage() {
  return (
    <main>
      <Suspense
        fallback={
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
            <LeaderboardSkeleton />
          </div>
        }
      >
        <LeaderboardView />
      </Suspense>
    </main>
  )
}
