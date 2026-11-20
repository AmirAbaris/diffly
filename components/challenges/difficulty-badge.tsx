import * as React from "react"
import { Badge } from "@/components/ui/badge"
import type { Difficulty } from "@/types/challenge"

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  if (difficulty === "Hard") {
    return <Badge variant="destructive">Hard</Badge>
  }

  if (difficulty === "Medium") {
    return <Badge variant="warning">Medium</Badge>
  }

  return <Badge variant="success">Easy</Badge>
}
