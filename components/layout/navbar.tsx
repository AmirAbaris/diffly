"use client"

import * as React from "react"
import Link from "next/link"
import { NavStats } from "@/components/layout/nav-stats"
import { UserNav } from "@/components/layout/user-nav"
import { cn } from "@/lib/utils"

export interface NavbarProps {
  className?: string
}

export function Navbar({ className }: NavbarProps) {
  return (
    <header
      data-testid="navbar"
      className={cn("w-full shrink-0 bg-background", className)}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Link
            href="/"
            className="font-pixel text-base tracking-tight text-foreground transition-opacity hover:opacity-80"
          >
            Diffly
          </Link>
          <span
            aria-hidden="true"
            className="hidden text-sm text-border select-none sm:inline"
          >
            /
          </span>
          <Link
            href="/challenges"
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Code Review Arena
          </Link>
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
