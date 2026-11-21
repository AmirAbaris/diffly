"use client"

import * as React from "react"
import { MarkdownPreview } from "@/components/review/markdown-preview"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export interface SummaryNoteEditorProps {
  note: string
  onChangeNote: (note: string) => void
  remainingChars: number
  isMinLengthMet: boolean
  disabled?: boolean
  placeholder?: string
}

export function SummaryNoteEditor({
  note,
  onChangeNote,
  remainingChars,
  isMinLengthMet,
  disabled = false,
  placeholder = "Summarize the overall risk, root cause, and remediation plan (or add notes inline on flagged lines)…",
}: SummaryNoteEditorProps) {
  const [activeTab, setActiveTab] = React.useState<"write" | "preview">("write")

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between border-b border-border pb-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("write")}
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
            onClick={() => setActiveTab("preview")}
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

      {activeTab === "write" ? (
        <Textarea
          value={note}
          onChange={(e) => onChangeNote(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          aria-label="Review summary note"
          className="min-h-24 resize-y font-sans text-xs leading-relaxed"
        />
      ) : (
        <MarkdownPreview content={note} className="min-h-24" />
      )}
    </div>
  )
}
