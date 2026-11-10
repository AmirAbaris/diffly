const attemptDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
})

export function formatAttemptDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    if (Number.isNaN(date.getTime())) {
      return dateStr
    }
    return attemptDateFormatter.format(date)
  } catch {
    return dateStr
  }
}

export function getScoreBadgeClasses(score: number): {
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  className: string
} {
  if (score >= 80) {
    return {
      badgeVariant: "outline",
      className:
        "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold",
    }
  }
  if (score >= 50) {
    return {
      badgeVariant: "outline",
      className:
        "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold",
    }
  }
  return {
    badgeVariant: "outline",
    className:
      "border-destructive/40 bg-destructive/10 text-destructive font-semibold",
  }
}
