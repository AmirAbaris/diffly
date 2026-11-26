"use client"

import * as React from "react"
import { MarkdownPreview } from "@/components/review/markdown-preview"
import { Textarea } from "@/components/ui/textarea"
import { EditorToolbar } from "./editor-toolbar"

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
  placeholder = "Optional: summarize overall risk, cross-cutting root cause, or remediation plan…",
}: SummaryNoteEditorProps) {
  const [activeTab, setActiveTab] = React.useState<"write" | "preview">("write")

  return (
    <div className="flex flex-col gap-2">
      <EditorToolbar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        isMinLengthMet={isMinLengthMet}
        remainingChars={remainingChars}
      />

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
