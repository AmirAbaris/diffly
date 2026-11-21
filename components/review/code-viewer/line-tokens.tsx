"use client"

import * as React from "react"
import type { RenderProps } from "prism-react-renderer"
import { keyByValue } from "@/lib/unique-keys"

export interface LineTokensProps {
  lineTokens: RenderProps["tokens"][number] | undefined
  getTokenProps: RenderProps["getTokenProps"]
  keyPrefix: string
}

export function LineTokens({
  lineTokens,
  getTokenProps,
  keyPrefix,
}: LineTokensProps) {
  if (
    !lineTokens ||
    lineTokens.length === 0 ||
    (lineTokens.length === 1 && lineTokens[0].content === "")
  ) {
    return <span>&#8203;</span>
  }
  const keyed = keyByValue(
    lineTokens,
    (token) => `${keyPrefix}-${token.content || "empty"}`
  )
  return (
    <>
      {keyed.map(({ key, item: token }) => {
        const tokenProps = getTokenProps({ token })
        delete (tokenProps as { key?: unknown }).key
        return <span key={key} {...tokenProps} />
      })}
    </>
  )
}
