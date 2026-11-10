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

export function parseInlineTokens(text: string, prefix: string): InlineToken[] {
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

export function parseMarkdownBlocks(raw: string): MarkdownBlock[] {
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
