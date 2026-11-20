import * as React from "react"
import {
  type InlineToken,
  parseInlineTokens,
} from "@/components/review/markdown-parser"

export function renderInlineTokens(tokens: InlineToken[]): React.ReactNode {
  return tokens.map((token) => {
    switch (token.type) {
      case "bold":
        return (
          <strong key={token.id} className="font-semibold text-foreground">
            {renderInlineTokens(token.children)}
          </strong>
        )
      case "italic":
        return (
          <em key={token.id} className="text-foreground italic">
            {renderInlineTokens(token.children)}
          </em>
        )
      case "code":
        return (
          <code
            key={token.id}
            className="rounded border border-border/60 bg-muted/70 px-1.5 py-0.5 font-mono text-xs break-words text-foreground"
          >
            {token.text}
          </code>
        )
      case "strikethrough":
        return (
          <del key={token.id} className="text-muted-foreground line-through">
            {renderInlineTokens(token.children)}
          </del>
        )
      case "link": {
        const isExternal =
          token.href.startsWith("http://") || token.href.startsWith("https://")
        return (
          <a
            key={token.id}
            href={token.href}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {renderInlineTokens(token.children)}
          </a>
        )
      }
      case "text":
      default:
        return <React.Fragment key={token.id}>{token.text}</React.Fragment>
    }
  })
}

export function FormattedInlineText({ text }: { text: string }) {
  const tokens = React.useMemo(() => parseInlineTokens(text, "inline"), [text])
  return <>{renderInlineTokens(tokens)}</>
}
