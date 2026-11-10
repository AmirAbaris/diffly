import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Renders inline text with support for bold (**text**) and code spans (`code`).
 */
export function FormattedInline({ text }: { text: string }) {
  const parts = React.useMemo(() => {
    const raw = text.split(/(\*\*.*?\*\*|`.*?`)/g)
    const counts = new Map<string, number>()
    return raw.map((segment) => {
      const nextCount = (counts.get(segment) ?? 0) + 1
      counts.set(segment, nextCount)
      return {
        key: `inline-${segment}-${nextCount}`,
        raw: segment,
      }
    })
  }, [text])

  return (
    <>
      {parts.map(({ key, raw }) => {
        if (raw.startsWith("**") && raw.endsWith("**")) {
          return (
            <strong key={key} className="font-semibold text-foreground">
              {raw.slice(2, -2)}
            </strong>
          )
        }
        if (raw.startsWith("`") && raw.endsWith("`")) {
          return (
            <code
              key={key}
              className="rounded border border-border/70 bg-muted/70 px-1.5 py-0.5 font-mono text-[11px] text-foreground"
            >
              {raw.slice(1, -1)}
            </code>
          )
        }
        return <span key={key}>{raw}</span>
      })}
    </>
  )
}

/**
 * Lightweight, accessible typography component that parses paragraphs,
 * bullet lists, bold text, and inline code formatting.
 */
export function MarkdownTypography({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  const paragraphs = React.useMemo(() => {
    if (!content) return []
    const rawParagraphs = content.split(/\n\s*\n/)
    const pCounts = new Map<string, number>()

    return rawParagraphs.map((para) => {
      const trimmed = para.trim()
      const pCount = (pCounts.get(trimmed) ?? 0) + 1
      pCounts.set(trimmed, pCount)

      const lines = trimmed.split("\n")
      const isBulletList = lines.every(
        (line) => line.trim().startsWith("- ") || line.trim().startsWith("* ")
      )

      const listItems = isBulletList
        ? lines.map((line, lIdx) => {
            const itemText = line.trim().replace(/^[-*]\s+/, "")
            return {
              key: `li-${itemText.slice(0, 16)}-${lIdx}`,
              text: itemText,
            }
          })
        : []

      return {
        key: `para-${trimmed.slice(0, 16)}-${pCount}`,
        trimmed,
        isBulletList,
        listItems,
      }
    })
  }, [content])

  if (!content) return null

  return (
    <div
      className={cn("flex flex-col gap-2.5 text-xs leading-relaxed", className)}
    >
      {paragraphs.map(({ key, trimmed, isBulletList, listItems }) => {
        if (isBulletList) {
          return (
            <ul key={key} className="my-1 flex flex-col gap-1 pl-1">
              {listItems.map((item) => (
                <li key={item.key} className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/70" />
                  <span>
                    <FormattedInline text={item.text} />
                  </span>
                </li>
              ))}
            </ul>
          )
        }

        return (
          <p key={key}>
            <FormattedInline text={trimmed} />
          </p>
        )
      })}
    </div>
  )
}
