import type { Metadata } from "next"
import * as React from "react"
import { LandingPage } from "@/components/landing/landing-page"

export const metadata: Metadata = {
  title: "Diffly · AI Code Review Arena",
  description:
    "Audit AI agent pull requests for race conditions, injection sinks, and sandbox escapes. Scored line by line.",
}

export const instant = false

export default function RootPage() {
  return <LandingPage />
}
