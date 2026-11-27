"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Highlight, themes } from "prism-react-renderer"
import { renderInlineTokens } from "@/components/review/formatted-inline"
import {
  type BlockquoteLine,
  type InlineToken,
  type ListItem,
  type MarkdownBlock,
  parseInlineTokens,
  parseMarkdownBlocks,
} from "@/components/review/markdown-parser"
import { normalizeCodeLanguage } from "@/lib/languages/registry"
import { Prism } from "@/lib/prism-languages"
import { cn } from "@/lib/utils"

export type { InlineToken, ListItem, BlockquoteLine, MarkdownBlock }
export { parseInlineTokens, parseMarkdownBlocks }

export interface MarkdownPreviewProps {
  content: string
  className?: string
}

function CodeBlockRenderer({
  code,
  language,
}: {
  code: string
  language: string
}) {
  const { resolvedTheme } = useTheme()
  const currentTheme =
    resolvedTheme === "light" ? themes.vsLight : themes.vsDark
  const normalizedLang = normalizeCodeLanguage(language, {
    fallback: "text",
    preserveUnknown: true,
  })

  return (
    <div className="my-2 overflow-hidden rounded-md border border-border bg-muted/40 font-mono text-xs">
      <div className="flex items-center justify-between border-b border-border bg-muted/60 px-3 py-1 text-xs text-muted-foreground uppercase">
        <span>{normalizedLang}</span>
      </div>
      <div className="overflow-x-auto p-3">
        <Highlight
          prism={Prism}
          theme={currentTheme}
          code={code}
          language={normalizedLang}
        >
          {({ tokens, getLineProps, getTokenProps }) => {
            const formattedLines = tokens.map((lineTokens, i) => {
              const lineId = `cb-line-${i + 1}`
              return {
                id: lineId,
                lineTokens,
                items: lineTokens.map((token, j) => ({
                  id: `${lineId}-t-${j + 1}`,
                  token,
                })),
              }
            })

            return (
              <pre className="text-xs leading-relaxed">
                {formattedLines.map((line) => {
                  const lineProps = getLineProps({ line: line.lineTokens })
                  delete (lineProps as { key?: unknown }).key

                  return (
                    <div key={line.id} {...lineProps}>
                      {line.items.map((item) => {
                        const tokenProps = getTokenProps({ token: item.token })
                        delete (tokenProps as { key?: unknown }).key

                        return <span key={item.id} {...tokenProps} />
                      })}
                    </div>
                  )
                })}
              </pre>
            )
          }}
        </Highlight>
      </div>
    </div>
  )
}

export function MarkdownPreview({ content, className }: MarkdownPreviewProps) {
  const blocks = React.useMemo(() => {
    if (!content) return []
    return parseMarkdownBlocks(content)
  }, [content])

  if (!content.trim()) {
    return (
      <div
        data-testid="markdown-preview-empty"
        className={cn(
          "rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground italic",
          className
        )}
      >
        Nothing to preview yet. Write markdown in the editor.
      </div>
    )
  }

  return (
    <div
      data-testid="markdown-preview"
      className={cn(
        "flex flex-col gap-2 rounded-md border border-border bg-card p-4 text-xs leading-relaxed text-card-foreground shadow-xs",
        className
      )}
    >
      {blocks.map((block) => {
        switch (block.type) {
          case "heading": {
            const headingClasses = {
              1: "text-base font-bold text-foreground border-b border-border pb-1 mt-2 first:mt-0",
              2: "text-sm font-bold text-foreground border-b border-border/60 pb-0.5 mt-2 first:mt-0",
              3: "text-xs font-semibold text-foreground mt-1.5 first:mt-0",
              4: "text-xs font-medium text-muted-foreground mt-1 first:mt-0",
            }[block.level]

            return (
              <div
                key={block.id}
                className={headingClasses}
                data-testid={`md-heading-${block.level}`}
              >
                {renderInlineTokens(block.tokens)}
              </div>
            )
          }

          case "code-block":
            return (
              <CodeBlockRenderer
                key={block.id}
                code={block.code}
                language={block.language}
              />
            )

          case "blockquote":
            return (
              <blockquote
                key={block.id}
                data-testid="md-blockquote"
                className="my-1 border-l-2 border-primary/60 bg-muted/30 py-1 pr-2 pl-3 text-xs text-muted-foreground italic"
              >
                {block.lines.map((line) => (
                  <div key={line.id} className="min-h-[1.2rem]">
                    {renderInlineTokens(line.tokens)}
                  </div>
                ))}
              </blockquote>
            )

          case "unordered-list":
            return (
              <ul
                key={block.id}
                data-testid="md-unordered-list"
                className="my-1 list-disc space-y-0.5 pr-2 pl-5 text-xs text-foreground"
              >
                {block.items.map((item) => (
                  <li key={item.id}>{renderInlineTokens(item.tokens)}</li>
                ))}
              </ul>
            )

          case "ordered-list":
            return (
              <ol
                key={block.id}
                data-testid="md-ordered-list"
                className="my-1 list-decimal space-y-0.5 pr-2 pl-5 text-xs text-foreground"
              >
                {block.items.map((item) => (
                  <li key={item.id}>{renderInlineTokens(item.tokens)}</li>
                ))}
              </ol>
            )

          case "paragraph":
          default:
            return (
              <p
                key={block.id}
                data-testid="md-paragraph"
                className="text-xs leading-relaxed text-foreground"
              >
                {renderInlineTokens(block.tokens)}
              </p>
            )
        }
      })}
    </div>
  )
}
