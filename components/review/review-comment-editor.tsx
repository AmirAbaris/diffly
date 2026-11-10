"use client"

import * as React from "react"
import {
  CheckCircle2,
  Eye,
  Flag,
  PenLine,
  Send,
  Sparkles,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MarkdownPreview } from "@/components/review/markdown-preview"
import { cn } from "@/lib/utils"

export interface ReviewCommentEditorProps {
  flaggedLines: number[]
  onToggleLine: (line: number) => void
  onClearFlaggedLines?: () => void
  comment: string
  onChangeComment: (comment: string) => void
  minCharacters?: number
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  onSubmitReview?: () => void
  isSubmitting?: boolean
  className?: string
}

interface FlaggedLinesStripProps {
  sortedLines: number[]
  readOnly: boolean
  disabled: boolean
  onToggleLine: (line: number) => void
  onClearFlaggedLines?: () => void
}

function FlaggedLinesStrip({
  sortedLines,
  readOnly,
  disabled,
  onToggleLine,
  onClearFlaggedLines,
}: FlaggedLinesStripProps) {
  return (
    <div
      data-testid="flagged-lines-container"
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1 font-medium text-foreground">
          <Flag className="size-3.5 text-amber-500" />
          <span>Flagged lines:</span>
        </span>

        {sortedLines.length > 0 ? (
          sortedLines.map((line) => (
            <Badge
              key={line}
              variant="outline"
              className="gap-1 border-amber-500/40 bg-amber-500/10 py-0.5 pr-1 font-mono text-[11px] text-amber-700 dark:text-amber-400"
            >
              <span>L{line}</span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onToggleLine(line)}
                  disabled={disabled}
                  className="rounded-full p-0.5 text-amber-700 transition-colors hover:bg-amber-500/20 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
                  aria-label={`Unflag line ${line}`}
                >
                  <X className="size-3" />
                </button>
              )}
            </Badge>
          ))
        ) : (
          <span className="text-muted-foreground italic">
            None selected. Click line numbers in code viewer to flag defects.
          </span>
        )}
      </div>

      {sortedLines.length > 0 && onClearFlaggedLines && !readOnly && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClearFlaggedLines}
          disabled={disabled}
          className="h-6 px-2 text-[11px] text-muted-foreground transition-colors hover:text-destructive"
        >
          Clear all
        </Button>
      )}
    </div>
  )
}

interface EditorToolbarProps {
  activeTab: "write" | "preview"
  onChangeTab: (tab: "write" | "preview") => void
  isMinLengthMet: boolean
  remainingChars: number
}

function EditorToolbar({
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
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            activeTab === "write"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          aria-pressed={activeTab === "write"}
        >
          <PenLine className="size-3.5" />
          <span>Write</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeTab("preview")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            activeTab === "preview"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          aria-pressed={activeTab === "preview"}
        >
          <Eye className="size-3.5" />
          <span>Preview</span>
        </button>
      </div>

      <div className="flex items-center gap-2 text-[11px]">
        {isMinLengthMet ? (
          <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" />
            <span>Min length met</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Sparkles className="size-3 text-amber-500" />
            <span>
              {remainingChars} more char{remainingChars === 1 ? "" : "s"} needed
            </span>
          </span>
        )}
      </div>
    </div>
  )
}

interface EditorFooterProps {
  wordCount: number
  charCount: number
  minCharacters: number
  isMinLengthMet: boolean
  canSubmit: boolean
  isSubmitting: boolean
  onSubmitReview?: () => void
}

function EditorFooter({
  wordCount,
  charCount,
  minCharacters,
  isMinLengthMet,
  canSubmit,
  isSubmitting,
  onSubmitReview,
}: EditorFooterProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span data-testid="counter-stats">
          {wordCount} {wordCount === 1 ? "word" : "words"} ({charCount}{" "}
          {charCount === 1 ? "char" : "chars"})
        </span>
        <span className="text-border">•</span>
        <span
          data-testid="validation-indicator"
          className={cn(
            "font-medium",
            isMinLengthMet
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-400"
          )}
        >
          {isMinLengthMet
            ? "Critique valid"
            : `${charCount}/${minCharacters} chars required`}
        </span>
      </div>

      {onSubmitReview && (
        <Button
          type="button"
          size="sm"
          onClick={onSubmitReview}
          disabled={!canSubmit}
          className="h-8 gap-1.5 px-3 text-xs"
        >
          <Send className="size-3.5" />
          <span>{isSubmitting ? "Submitting..." : "Submit Review"}</span>
        </Button>
      )}
    </div>
  )
}

export function ReviewCommentEditor({
  flaggedLines,
  onToggleLine,
  onClearFlaggedLines,
  comment,
  onChangeComment,
  minCharacters = 30,
  placeholder = "Explain what vulnerability or antipattern is present, what risk it poses, and how to fix it...",
  disabled = false,
  readOnly = false,
  onSubmitReview,
  isSubmitting = false,
  className,
}: ReviewCommentEditorProps) {
  const [activeTab, setActiveTab] = React.useState<"write" | "preview">("write")

  const sortedLines = React.useMemo(() => {
    return flaggedLines.slice().sort((a, b) => a - b)
  }, [flaggedLines])

  const charCount = comment.length
  const wordCount = React.useMemo(() => {
    const trimmed = comment.trim()
    return trimmed ? trimmed.split(/\s+/).length : 0
  }, [comment])

  const isMinLengthMet = charCount >= minCharacters
  const remainingChars = Math.max(0, minCharacters - charCount)

  const canSubmit =
    !disabled &&
    !readOnly &&
    !isSubmitting &&
    Boolean(comment.trim()) &&
    isMinLengthMet

  return (
    <div
      data-testid="review-comment-editor"
      className={cn("flex flex-col gap-3", className)}
    >
      <FlaggedLinesStrip
        sortedLines={sortedLines}
        readOnly={readOnly}
        disabled={disabled}
        onToggleLine={onToggleLine}
        onClearFlaggedLines={onClearFlaggedLines}
      />

      <EditorToolbar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        isMinLengthMet={isMinLengthMet}
        remainingChars={remainingChars}
      />

      {activeTab === "write" ? (
        <div className="flex flex-col gap-1.5">
          <Textarea
            value={comment}
            onChange={(e) => onChangeComment(e.target.value)}
            placeholder={placeholder}
            disabled={disabled || readOnly}
            aria-label="Review critique"
            className="min-h-[110px] resize-y font-sans text-xs leading-relaxed"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <MarkdownPreview content={comment} className="min-h-[110px]" />
        </div>
      )}

      <EditorFooter
        wordCount={wordCount}
        charCount={charCount}
        minCharacters={minCharacters}
        isMinLengthMet={isMinLengthMet}
        canSubmit={canSubmit}
        isSubmitting={isSubmitting}
        onSubmitReview={onSubmitReview}
      />
    </div>
  )
}
