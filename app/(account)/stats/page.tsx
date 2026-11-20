import type { Metadata } from "next"
import * as React from "react"
import { Suspense } from "react"
import { StatsView } from "@/components/account/stats-view"

export const metadata: Metadata = {
  title: "Stats",
  description:
    "Explore category mastery, precision vs. recall trends, and timezone-aware streak history.",
}

export const instant = false

export default function StatsPage() {
  return (
    <Suspense fallback={null}>
      <StatsView />
    </Suspense>
  )
}
