"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface EditorToolbarProps {
  activeTab: "write" | "preview"
  onChangeTab: (tab: "write" | "preview") => void
  isMinLengthMet: boolean
  remainingChars: number
}

export function EditorToolbar({
  activeTab,
  onChangeTab,
  isMinLengthMet,
  remainingChars,
}: EditorToolbarProps) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-1.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChangeTab("write")}
          className={cn(
            "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            activeTab === "write"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          aria-pressed={activeTab === "write"}
        >
          <span>Write</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeTab("preview")}
          className={cn(
            "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            activeTab === "preview"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          aria-pressed={activeTab === "preview"}
        >
          <span>Preview</span>
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs tabular-nums">
        {isMinLengthMet ? (
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            Min length met
          </span>
        ) : (
          <span className="text-muted-foreground">
            {remainingChars} more char{remainingChars === 1 ? "" : "s"} needed
          </span>
        )}
      </div>
    </div>
  )
}
