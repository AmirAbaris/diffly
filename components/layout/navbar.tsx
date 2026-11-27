"use client"

import * as React from "react"
import Link from "next/link"
import { DifflyLogo } from "@/components/brand/diffly-logo"
import { GitHubIcon } from "@/components/brand/github-icon"
import { NavStats } from "@/components/layout/nav-stats"
import { UserNav } from "@/components/layout/user-nav"
import { Button } from "@/components/ui/button"
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
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          <Link
            href="/"
            className="inline-flex shrink-0 items-center gap-1.5 font-pixel text-base tracking-tight text-foreground transition-opacity hover:opacity-80 sm:gap-2"
          >
            <DifflyLogo className="size-4.5" />
            <span>Diffly</span>
          </Link>
          <span
            aria-hidden="true"
            className="hidden text-sm text-border select-none sm:inline"
          >
            /
          </span>
          <Link
            href="/challenges"
            className="hidden text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            Code Review Arena
          </Link>
          <span
            aria-hidden="true"
            className="hidden text-sm text-border select-none sm:inline"
          >
            /
          </span>
          <Link
            href="/coach"
            data-testid="navbar-coach-link"
            className="hidden text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            Agent Coach
          </Link>
          <span
            aria-hidden="true"
            className="hidden text-sm text-border select-none sm:inline"
          >
            /
          </span>
          <Link
            href="/leaderboard"
            data-testid="navbar-leaderboard-link"
            className="hidden text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            Leaderboard
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          <NavStats />
          <div className="hidden h-4 w-px bg-border sm:block" />
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            className="hidden text-muted-foreground hover:text-foreground sm:inline-flex"
          >
            <a
              href="https://github.com/AmirAbaris/diffly/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View Diffly source code on GitHub"
              data-testid="navbar-github-link"
            >
              <GitHubIcon className="size-4" />
            </a>
          </Button>
          <UserNav />
        </div>
      </div>
    </header>
  )
}
