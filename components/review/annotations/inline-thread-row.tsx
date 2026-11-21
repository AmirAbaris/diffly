"use client"

import * as React from "react"
import type { LineRef } from "@/lib/review"
import { FindingThreadEditor } from "./finding-thread-editor"
import { useThreadSlot } from "./use-row-annotation"
import { VerdictThreadCard } from "./verdict-thread-card"

export interface InlineThreadRowProps {
  at: LineRef | null
  colSpan: number
}

export function InlineThreadRow({ at, colSpan }: InlineThreadRowProps) {
  const slot = useThreadSlot(at)
  if (!slot) return null

  return (
    <tr className="bg-transparent">
      <td colSpan={colSpan} className="px-2 py-0.5">
        <div className="sticky left-0 w-[calc(100cqw-1rem)] max-w-2xl">
          {slot.kind === "draft" ? (
            <FindingThreadEditor
              key={slot.finding.id}
              finding={slot.finding}
              editing={slot.editing}
            />
          ) : (
            <VerdictThreadCard
              mark={slot.mark}
              defect={slot.defect}
              finding={slot.finding}
              verdict={slot.verdict}
            />
          )}
        </div>
      </td>
    </tr>
  )
}
