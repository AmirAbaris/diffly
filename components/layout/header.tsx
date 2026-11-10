"use client"

import * as React from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { NavStats } from "@/components/layout/nav-stats"
import { UserNav } from "@/components/layout/user-nav"

export function Header() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-2.5 sm:gap-3">
        <Link
          href="/challenges"
          className="text-lg font-bold tracking-tight text-primary transition-opacity hover:opacity-90 sm:text-xl"
        >
          Diffly
        </Link>
        <Badge
          variant="outline"
          className="xs:inline-flex hidden text-[11px] font-medium sm:inline-flex"
        >
          Code Review Arena
        </Badge>
      </div>

      <div className="flex items-center gap-2 sm:gap-3.5">
        <NavStats />
        <div className="hidden h-4 w-px bg-border sm:block" />
        <UserNav />
      </div>
    </header>
  )
}
