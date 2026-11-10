"use client"

import * as React from "react"
import { Highlight, themes } from "prism-react-renderer"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

export interface MarkdownPreviewProps {
  content: string
  className?: string
}

export interface InlineToken {
  id: string
  type: "text" | "bold" | "italic" | "code" | "strikethrough"
  text: string
}

export interface ListItem {
  id: string
  tokens: InlineToken[]
}

export interface BlockquoteLine {
  id: string
  tokens: InlineToken[]
}

export type MarkdownBlock =
  | { id: string; type: "heading"; level: 1 | 2 | 3 | 4; tokens: InlineToken[] }
  | { id: string; type: "code-block"; language: string; code: string }
  | { id: string; type: "blockquote"; lines: BlockquoteLine[] }
  | { id: string; type: "unordered-list"; items: ListItem[] }
  | { id: string; type: "ordered-list"; items: ListItem[] }
  | { id: string; type: "paragraph"; tokens: InlineToken[] }

function parseInlineTokens(text: string, prefix: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let remaining = text
  let tokenCounter = 0

  while (remaining.length > 0) {
    tokenCounter++
    const tokenId = `${prefix}-tok-${tokenCounter}`

    const codeMatch = remaining.match(/^`([^`]+)`/)
    if (codeMatch) {
      tokens.push({ id: tokenId, type: "code", text: codeMatch[1] })
      remaining = remaining.slice(codeMatch[0].length)
      continue
    }

    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/)
    if (boldMatch) {
      tokens.push({ id: tokenId, type: "bold", text: boldMatch[1] })
      remaining = remaining.slice(boldMatch[0].length)
      continue
    }

    const strikeMatch = remaining.match(/^~~([^~]+)~~/)
    if (strikeMatch) {
      tokens.push({ id: tokenId, type: "strikethrough", text: strikeMatch[1] })
      remaining = remaining.slice(strikeMatch[0].length)
      continue
    }

    const italicMatch = remaining.match(/^(\*|_)([^*_]+)\1/)
    if (italicMatch) {
      tokens.push({ id: tokenId, type: "italic", text: italicMatch[2] })
      remaining = remaining.slice(italicMatch[0].length)
      continue
    }

    const nextSpecial = remaining.search(/[`*_~]/)
    if (nextSpecial === -1) {
      tokens.push({ id: tokenId, type: "text", text: remaining })
      break
    } else if (nextSpecial === 0) {
      tokens.push({ id: tokenId, type: "text", text: remaining[0] })
      remaining = remaining.slice(1)
    } else {
      tokens.push({
        id: tokenId,
        type: "text",
        text: remaining.slice(0, nextSpecial),
      })
      remaining = remaining.slice(nextSpecial)
    }
  }

  return tokens
}

function parseMarkdownBlocks(raw: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  const lines = raw.replace(/\r\n/g, "\n").split("\n")
  let lineIdx = 0
  let blockCounter = 0

  while (lineIdx < lines.length) {
    const line = lines[lineIdx]

    if (!line.trim()) {
      lineIdx++
      continue
    }

    blockCounter++
    const blockId = `block-${blockCounter}`

    if (line.trim().startsWith("```")) {
      const language = line.trim().slice(3).trim() || "text"
      const codeLines: string[] = []
      lineIdx++
      while (
        lineIdx < lines.length &&
        !lines[lineIdx].trim().startsWith("```")
      ) {
        codeLines.push(lines[lineIdx])
        lineIdx++
      }
      if (lineIdx < lines.length) {
        lineIdx++
      }
      blocks.push({
        id: blockId,
        type: "code-block",
        language,
        code: codeLines.join("\n"),
      })
      continue
    }

    if (line.startsWith("#")) {
      const match = line.match(/^(#{1,4})\s+(.+)$/)
      if (match) {
        const level = match[1].length as 1 | 2 | 3 | 4
        blocks.push({
          id: blockId,
          type: "heading",
          level,
          tokens: parseInlineTokens(match[2], blockId),
        })
        lineIdx++
        continue
      }
    }

    if (line.startsWith(">")) {
      const quoteLines: BlockquoteLine[] = []
      let quoteLineCount = 0
      while (lineIdx < lines.length && lines[lineIdx].startsWith(">")) {
        quoteLineCount++
        const lineId = `${blockId}-line-${quoteLineCount}`
        const text = lines[lineIdx].replace(/^>\s?/, "")
        quoteLines.push({
          id: lineId,
          tokens: parseInlineTokens(text, lineId),
        })
        lineIdx++
      }
      blocks.push({
        id: blockId,
        type: "blockquote",
        lines: quoteLines,
      })
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      const items: ListItem[] = []
      let itemCount = 0
      while (lineIdx < lines.length && /^[-*]\s+/.test(lines[lineIdx])) {
        itemCount++
        const itemId = `${blockId}-item-${itemCount}`
        const itemText = lines[lineIdx].replace(/^[-*]\s+/, "")
        items.push({
          id: itemId,
          tokens: parseInlineTokens(itemText, itemId),
        })
        lineIdx++
      }
      blocks.push({
        id: blockId,
        type: "unordered-list",
        items,
      })
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: ListItem[] = []
      let itemCount = 0
      while (lineIdx < lines.length && /^\d+\.\s+/.test(lines[lineIdx])) {
        itemCount++
        const itemId = `${blockId}-item-${itemCount}`
        const itemText = lines[lineIdx].replace(/^\d+\.\s+/, "")
        items.push({
          id: itemId,
          tokens: parseInlineTokens(itemText, itemId),
        })
        lineIdx++
      }
      blocks.push({
        id: blockId,
        type: "ordered-list",
        items,
      })
      continue
    }

    const paragraphLines: string[] = []
    while (
      lineIdx < lines.length &&
      lines[lineIdx].trim() &&
      !lines[lineIdx].trim().startsWith("```") &&
      !lines[lineIdx].startsWith("#") &&
      !lines[lineIdx].startsWith(">") &&
      !/^[-*]\s+/.test(lines[lineIdx]) &&
      !/^\d+\.\s+/.test(lines[lineIdx])
    ) {
      paragraphLines.push(lines[lineIdx])
      lineIdx++
    }

    blocks.push({
      id: blockId,
      type: "paragraph",
      tokens: parseInlineTokens(paragraphLines.join(" "), blockId),
    })
  }

  return blocks
}

function renderTokens(tokens: InlineToken[]) {
  return tokens.map((token) => {
    switch (token.type) {
      case "bold":
        return (
          <strong key={token.id} className="font-semibold text-foreground">
            {token.text}
          </strong>
        )
      case "italic":
        return (
          <em key={token.id} className="text-foreground italic">
            {token.text}
          </em>
        )
      case "code":
        return (
          <code
            key={token.id}
            className="rounded border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-[11px] [overflow-wrap:anywhere] break-all text-foreground"
          >
            {token.text}
          </code>
        )
      case "strikethrough":
        return (
          <del key={token.id} className="text-muted-foreground line-through">
            {token.text}
          </del>
        )
      case "text":
      default:
        return <span key={token.id}>{token.text}</span>
    }
  })
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
  const normalizedLang = language.toLowerCase().trim() || "text"

  return (
    <div className="my-2 overflow-hidden rounded-md border border-border bg-muted/40 font-mono text-xs">
      <div className="flex items-center justify-between border-b border-border bg-muted/60 px-3 py-1 text-[10px] text-muted-foreground uppercase">
        <span>{normalizedLang}</span>
      </div>
      <div className="overflow-x-auto p-3">
        <Highlight theme={currentTheme} code={code} language={normalizedLang}>
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
  const blocks = React.useMemo(() => parseMarkdownBlocks(content), [content])

  if (!content.trim()) {
    return (
      <div
        data-testid="markdown-preview-empty"
        className={cn(
          "flex min-h-[120px] items-center justify-center rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground",
          className
        )}
      >
        Nothing to preview. Enter your review critique in the editor.
      </div>
    )
  }

  return (
    <div
      data-testid="markdown-preview"
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-md border border-border bg-background p-3 text-xs leading-relaxed text-foreground",
        className
      )}
    >
      {blocks.map((block) => {
        switch (block.type) {
          case "heading": {
            if (block.level === 1) {
              return (
                <h1
                  key={block.id}
                  className="mt-2 text-base font-bold text-foreground first:mt-0"
                >
                  {renderTokens(block.tokens)}
                </h1>
              )
            }
            if (block.level === 2) {
              return (
                <h2
                  key={block.id}
                  className="mt-1.5 text-sm font-semibold text-foreground first:mt-0"
                >
                  {renderTokens(block.tokens)}
                </h2>
              )
            }
            if (block.level === 3) {
              return (
                <h3
                  key={block.id}
                  className="mt-1 text-xs font-semibold text-foreground first:mt-0"
                >
                  {renderTokens(block.tokens)}
                </h3>
              )
            }
            return (
              <h4
                key={block.id}
                className="mt-1 text-xs font-medium text-foreground first:mt-0"
              >
                {renderTokens(block.tokens)}
              </h4>
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
                className="my-1 border-l-2 border-primary/50 bg-muted/20 py-1 pl-3 text-muted-foreground italic"
              >
                {block.lines.map((line) => (
                  <div key={line.id}>{renderTokens(line.tokens)}</div>
                ))}
              </blockquote>
            )
          case "unordered-list":
            return (
              <ul
                key={block.id}
                className="list-disc space-y-1 pl-4 text-xs text-foreground"
              >
                {block.items.map((item) => (
                  <li key={item.id}>{renderTokens(item.tokens)}</li>
                ))}
              </ul>
            )
          case "ordered-list":
            return (
              <ol
                key={block.id}
                className="list-decimal space-y-1 pl-4 text-xs text-foreground"
              >
                {block.items.map((item) => (
                  <li key={item.id}>{renderTokens(item.tokens)}</li>
                ))}
              </ol>
            )
          case "paragraph":
          default:
            return (
              <p
                key={block.id}
                className="min-w-0 text-xs leading-relaxed break-words text-foreground"
              >
                {renderTokens(block.tokens)}
              </p>
            )
        }
      })}
    </div>
  )
}
