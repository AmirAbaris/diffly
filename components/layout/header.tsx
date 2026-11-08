import * as React from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"

export function Header() {
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
    </header>
  )
}
