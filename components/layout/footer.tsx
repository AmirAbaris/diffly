import * as React from "react"
import { DifflyLogo } from "@/components/brand/diffly-logo"
import { GitHubIcon } from "@/components/brand/github-icon"

export function Footer() {
  return (
    <footer className="px-4 py-4 text-xs text-muted-foreground sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <span className="flex items-center gap-2">
          <DifflyLogo className="size-3.5 text-muted-foreground" />
          <span>Diffly - Code Review Arena</span>
        </span>
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline">
            Press &quot;D&quot; to toggle theme
          </span>
          <a
            href="https://github.com/AmirAbaris/diffly/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View Diffly source code on GitHub"
            data-testid="footer-github-link"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <GitHubIcon className="size-3.5" />
            <span>GitHub</span>
          </a>
        </div>
      </div>
    </footer>
  )
}
