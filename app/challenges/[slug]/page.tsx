import type { Metadata } from "next"
import * as React from "react"
import { Suspense } from "react"
import { ArenaLayout } from "@/components/review/arena-layout"
import { ArenaLoadingShell } from "@/components/review/arena-loading-shell"

interface ChallengePageProps {
  params: Promise<{
    slug: string
  }>
}

export async function generateMetadata({
  params,
}: ChallengePageProps): Promise<Metadata> {
  const { slug } = await params
  const cleanTitle = slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")

  return {
    title: `${cleanTitle} - Arena`,
    description: `Review code diff, analyze agent flaws, and annotate vulnerabilities for ${cleanTitle}.`,
  }
}

async function ArenaContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <ArenaLayout slug={slug} />
}

export default function ChallengeArenaPage({ params }: ChallengePageProps) {
  return (
    <Suspense fallback={<ArenaLoadingShell />}>
      <ArenaContent params={params} />
    </Suspense>
  )
}
