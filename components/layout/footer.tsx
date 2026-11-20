import * as React from "react"
import { DifflyLogo } from "@/components/brand/diffly-logo"

export function Footer() {
  return (
    <footer className="px-4 py-4 text-xs text-muted-foreground sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <span className="flex items-center gap-2">
          <DifflyLogo className="size-3.5 text-muted-foreground" />
          <span>Diffly - Code Review Arena</span>
        </span>
        <span className="hidden sm:inline">
          Press &quot;D&quot; to toggle theme
        </span>
      </div>
    </footer>
  )
}
