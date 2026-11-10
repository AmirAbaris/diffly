import type { Metadata } from "next"
import * as React from "react"
import { Suspense } from "react"
import { ArenaLayout } from "@/components/review/arena-layout"
import { Skeleton } from "@/components/ui/skeleton"

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

export function ArenaFallback() {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/60 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-7 w-20" />
          <div className="h-4 w-px bg-border" />
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="h-6 w-20" />
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="hidden w-[42%] border-r border-border p-6 lg:block xl:w-[40%]">
          <div className="flex flex-col gap-6">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6 lg:w-[58%] xl:w-[60%]">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  )
}

export default function ChallengeArenaPage({ params }: ChallengePageProps) {
  return (
    <Suspense fallback={<ArenaFallback />}>
      <ArenaContent params={params} />
    </Suspense>
  )
}
