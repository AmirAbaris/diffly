"use client"

import * as React from "react"
import Link from "next/link"
import useSWR from "swr"
import { Badge } from "@/components/ui/badge"

interface HealthData {
  status: string
  service: string
}

export function Header() {
  const { data: health, isLoading: isHealthLoading } =
    useSWR<HealthData>("/api/health")

  return (
    <header className="flex items-center justify-between px-6 py-4">
      <div className="flex items-center gap-3">
        <Link
          href="/challenges"
          className="text-xl font-bold tracking-tight text-primary"
        >
          Diffly
        </Link>
        <Badge variant="outline">Code Review Arena</Badge>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Backend:</span>
        {isHealthLoading ? (
          <Badge variant="outline">Checking...</Badge>
        ) : health?.status === "healthy" ? (
          <Badge variant="secondary">Connected</Badge>
        ) : (
          <Badge variant="destructive">Offline</Badge>
        )}
      </div>
    </header>
  )
}
