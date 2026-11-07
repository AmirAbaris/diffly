"use client"

import useSWR from "swr"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"

interface HealthData {
  status: string
  service: string
}

export default function Page() {
  const { data: health, isLoading } = useSWR<HealthData>("/api/health")

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="text-primary text-xl font-bold tracking-tight">
            Diffly
          </div>
          <Badge variant="outline" className="text-xs">
            Code Review Arena
          </Badge>
        </div>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <span>Backend:</span>
          {isLoading ? (
            <Badge variant="outline" className="text-[10px]">
              Checking...
            </Badge>
          ) : health?.status === "healthy" ? (
            <Badge
              variant="secondary"
              className="text-[10px] text-emerald-600 dark:text-emerald-400"
            >
              Connected
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-[10px]">
              Offline
            </Badge>
          )}
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="flex w-full max-w-lg flex-col gap-4 p-6 text-center">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">
              Welcome to Diffly
            </h1>
            <p className="text-muted-foreground text-sm">
              LeetCode for Code Review on AI Agent Codes & Pull Requests.
            </p>
          </div>

          <div className="text-muted-foreground bg-muted rounded-lg p-3 text-left font-mono text-xs">
            <div>✓ Next.js 16 + shadcn/ui</div>
            <div>✓ Cache Components & Partial Prefetching enabled</div>
            <div>✓ SWR & Axios client fetcher configured</div>
            <div>✓ FastAPI backend running on /api/health</div>
            <div>✓ Strict PEP 8, Prettier & ESLint CI guardrails active</div>
          </div>
        </Card>
      </main>
    </div>
  )
}
