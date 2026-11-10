"use client"

import * as React from "react"
import Link from "next/link"
import { NavStats } from "@/components/layout/nav-stats"
import { UserNav } from "@/components/layout/user-nav"

export function Header() {
  return (
    <header className="w-full shrink-0 bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Link
            href="/challenges"
            className="text-base font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
          >
            Diffly
          </Link>
          <span
            aria-hidden="true"
            className="hidden text-sm text-border select-none sm:inline"
          >
            /
          </span>
          <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
            Code Review Arena
          </span>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3">
          <NavStats />
          <div className="hidden h-4 w-px bg-border sm:block" />
          <UserNav />
        </div>
      </div>
    </header>
  )
}
