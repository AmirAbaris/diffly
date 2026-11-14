import type { Metadata } from "next"
import * as React from "react"
import { LandingPage } from "@/components/landing/landing-page"

export const metadata: Metadata = {
  title: "Diffly · AI Code Review Benchmark & Training Arena",
  description:
    "Audit realistic AI agent pull requests for hidden race conditions, injection sinks, and sandbox escapes. Powered by WebGPU and deterministic line-level evaluation.",
}

export const instant = false

export default function RootPage() {
  return <LandingPage />
}
