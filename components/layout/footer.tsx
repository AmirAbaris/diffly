import * as React from "react"

export function Footer() {
  return (
    <footer className="px-6 py-4 text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <span>Diffly - Code Review Arena</span>
        <span className="hidden sm:inline">
          Press &quot;D&quot; to toggle theme
        </span>
      </div>
    </footer>
  )
}
