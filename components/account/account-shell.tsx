"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, Settings, User as UserIcon } from "lucide-react"
import { cn } from "@/lib/utils"

const ACCOUNT_TABS = [
  { href: "/profile", label: "Profile", icon: UserIcon },
  { href: "/stats", label: "Stats", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
] as const

export interface AccountShellProps {
  title: string
  description: string
  actions?: React.ReactNode
  children: React.ReactNode
}

export function AccountShell({
  title,
  description,
  actions,
  children,
}: AccountShellProps) {
  const pathname = usePathname()

  return (
    <main className="px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-balance text-foreground">
              {title}
            </h1>
            <p className="text-sm text-pretty text-muted-foreground">
              {description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <nav
              aria-label="Account sections"
              className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-1"
            >
              {ACCOUNT_TABS.map((tab) => {
                const Icon = tab.icon
                const isActive = pathname === tab.href
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                      isActive
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon aria-hidden="true" className="size-3.5" />
                    <span>{tab.label}</span>
                  </Link>
                )
              })}
            </nav>
            {actions}
          </div>
        </div>

        {children}
      </div>
    </main>
  )
}
