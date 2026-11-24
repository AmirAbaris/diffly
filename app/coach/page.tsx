import type { Metadata } from "next"
import * as React from "react"
import { Suspense } from "react"
import { CoachWorkspace } from "@/components/coach/coach-workspace"
import { Header } from "@/components/layout/header"
import { Separator } from "@/components/ui/separator"

export const metadata: Metadata = {
  title: "Agent Coach",
  description:
    "Interactive AI code review coach grounded in your Diffly review history, blind spots, and missed defects.",
}

export const instant = false

export default function CoachPage() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <Header />
      <Separator />
      <main className="flex min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={null}>
          <CoachWorkspace />
        </Suspense>
      </main>
    </div>
  )
}
