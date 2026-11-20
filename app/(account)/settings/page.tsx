import type { Metadata } from "next"
import * as React from "react"
import { Suspense } from "react"
import { SettingsView } from "@/components/account/settings-view"

export const metadata: Metadata = {
  title: "Settings",
  description:
    "Manage timezone preferences, GitHub OAuth connection, Gemini API key, and your Diffly session.",
}

export const instant = false

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsView />
    </Suspense>
  )
}
