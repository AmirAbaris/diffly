import * as React from "react"
import {
  FormattedInlineText,
  renderInlineTokens,
} from "@/components/review/formatted-inline"
import { parseMarkdownBlocks } from "@/components/review/markdown-parser"
import { cn } from "@/lib/utils"

/**
 * Renders inline text with support for bold, italic, code spans, strikethrough, and links.
 */
export function FormattedInline({ text }: { text: string }) {
  return <FormattedInlineText text={text} />
}

/**
 * Lightweight, accessible typography component that parses paragraphs,
 * bullet lists, and inline markdown formatting via the shared parser.
 */
export function MarkdownTypography({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  const blocks = React.useMemo(() => {
    if (!content) return []
    return parseMarkdownBlocks(content)
  }, [content])

  if (!content) return null

  return (
    <div
      className={cn("flex flex-col gap-2.5 text-xs leading-relaxed", className)}
    >
      {blocks.map((block) => {
        if (block.type === "unordered-list" || block.type === "ordered-list") {
          return (
            <ul key={block.id} className="my-1 flex flex-col gap-1 pl-1">
              {block.items.map((item) => (
                <li key={item.id} className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/70" />
                  <span>{renderInlineTokens(item.tokens)}</span>
                </li>
              ))}
            </ul>
          )
        }

        if (block.type === "heading" || block.type === "paragraph") {
          return <p key={block.id}>{renderInlineTokens(block.tokens)}</p>
        }

        if (block.type === "blockquote") {
          return (
            <blockquote
              key={block.id}
              className="border-l-2 border-primary/60 pl-3 text-muted-foreground italic"
            >
              {block.lines.map((line) => (
                <div key={line.id}>{renderInlineTokens(line.tokens)}</div>
              ))}
            </blockquote>
          )
        }

        return (
          <pre
            key={block.id}
            className="overflow-x-auto rounded border border-border bg-muted/50 p-2 font-mono text-xs"
          >
            <code>{block.code}</code>
          </pre>
        )
      })}
    </div>
  )
}
