import type { Metadata } from "next"
import * as React from "react"
import { Suspense } from "react"
import { connection } from "next/server"
import { ArenaLayout } from "@/components/review/arena-layout"
import { ArenaLoadingShell } from "@/components/review/arena-loading-shell"
import { resolveChallengeMetadata } from "@/lib/server/challenge-metadata"

interface ChallengePageProps {
  params: Promise<{
    slug: string
  }>
  searchParams: Promise<{
    share_token?: string | string[]
  }>
}

function extractShareToken(
  raw: string | string[] | undefined
): string | undefined {
  if (Array.isArray(raw)) {
    return raw[0]
  }
  return raw
}

export async function generateMetadata({
  params,
  searchParams,
}: ChallengePageProps): Promise<Metadata> {
  const [{ slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ])
  const shareToken = extractShareToken(resolvedSearchParams?.share_token)
  return resolveChallengeMetadata(slug, shareToken)
}

async function DynamicMarker() {
  await connection()
  return null
}

async function ArenaContent({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ share_token?: string | string[] }>
}) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ])
  const shareToken = extractShareToken(resolvedSearchParams?.share_token)
  return <ArenaLayout slug={slug} shareToken={shareToken} />
}

export default function ChallengeArenaPage({
  params,
  searchParams,
}: ChallengePageProps) {
  return (
    <Suspense fallback={<ArenaLoadingShell />}>
      <DynamicMarker />
      <ArenaContent params={params} searchParams={searchParams} />
    </Suspense>
  )
}
