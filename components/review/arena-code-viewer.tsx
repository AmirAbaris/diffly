"use client"

import * as React from "react"
import {
  CodeViewer,
  type CodeViewerProps,
} from "@/components/review/code-viewer"

export type ArenaCodeViewerProps = CodeViewerProps

export function ArenaCodeViewer(props: ArenaCodeViewerProps) {
  return <CodeViewer {...props} />
}
