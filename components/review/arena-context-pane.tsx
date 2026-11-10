"use client"

import * as React from "react"
import {
  ChallengeContextPanel,
  type ChallengeContextPanelProps,
} from "@/components/review/challenge-context-panel"

export type ArenaContextPaneProps = ChallengeContextPanelProps

export function ArenaContextPane(props: ArenaContextPaneProps) {
  return <ChallengeContextPanel {...props} />
}
