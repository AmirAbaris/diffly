"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

interface Challenge {
  id: number
  slug: string
  title: string
  difficulty: "Easy" | "Medium" | "Hard"
  category: string
  description: string
  language: string
}

interface ChallengeDetail extends Challenge {
  code_snippet: string
}

interface ReviewResult {
  submission_id: number
  score: number
  feedback: string
  detected_issues: string[]
}

export default function Page() {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [selectedChallenge, setSelectedChallenge] =
    useState<ChallengeDetail | null>(null)
  const [flaggedLine, setFlaggedLine] = useState<number | null>(null)
  const [comments, setComments] = useState("")
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch("/api/challenges")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Challenge[]) => {
        setChallenges(data)
        if (data.length > 0) {
          fetch(`/api/challenges/${data[0].id}`)
            .then((res) => res.json())
            .then((detail: ChallengeDetail) => setSelectedChallenge(detail))
        }
      })
      .catch(() => {})
  }, [])

  const selectChallenge = (id: number) => {
    setReviewResult(null)
    setFlaggedLine(null)
    setComments("")
    fetch(`/api/challenges/${id}`)
      .then((res) => res.json())
      .then((detail: ChallengeDetail) => setSelectedChallenge(detail))
  }

  const handleReviewSubmit = async () => {
    if (!selectedChallenge || flaggedLine === null || !comments.trim()) return

    setSubmitting(true)
    try {
      const res = await fetch(
        `/api/challenges/${selectedChallenge.id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flagged_lines: [flaggedLine],
            comments,
          }),
        }
      )
      const data = await res.json()
      setReviewResult(data)
    } catch {
      // Offline fallback handling
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="text-primary text-xl font-bold tracking-tight">
            Diffly
          </div>
          <Badge variant="outline" className="text-xs">
            Agent Code Review Arena
          </Badge>
        </div>
        <div className="text-muted-foreground text-xs">
          LeetCode for Reviewing AI Agent Codes & PRs
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-12">
        {/* Challenge Sidebar */}
        <div className="flex flex-col gap-3 lg:col-span-4">
          <h2 className="text-muted-foreground text-sm font-semibold tracking-wider uppercase">
            Review Challenges
          </h2>
          {challenges.map((c) => (
            <Card
              key={c.id}
              onClick={() => selectChallenge(c.id)}
              className={`cursor-pointer border p-4 transition-all ${
                selectedChallenge?.id === c.id
                  ? "border-primary bg-accent/30"
                  : "hover:border-border/80"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium">{c.title}</span>
                <Badge
                  variant={
                    c.difficulty === "Easy"
                      ? "secondary"
                      : c.difficulty === "Medium"
                        ? "default"
                        : "destructive"
                  }
                  className="text-xs"
                >
                  {c.difficulty}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-2 line-clamp-2 text-xs">
                {c.description}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <span className="bg-muted rounded px-2 py-0.5 font-mono text-[10px] uppercase">
                  {c.language}
                </span>
                <span className="text-muted-foreground text-[10px]">
                  {c.category}
                </span>
              </div>
            </Card>
          ))}
        </div>

        {/* Workspace */}
        <div className="flex flex-col gap-4 lg:col-span-8">
          {selectedChallenge ? (
            <>
              <div>
                <h1 className="text-xl font-bold">{selectedChallenge.title}</h1>
                <p className="text-muted-foreground mt-1 text-sm">
                  {selectedChallenge.description}
                </p>
              </div>

              {/* Code viewer with line selection */}
              <div className="overflow-hidden rounded-lg border bg-zinc-950 font-mono text-xs text-zinc-100">
                <div className="flex justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-2 text-[11px] text-zinc-400">
                  <span>
                    code_snippet.
                    {selectedChallenge.language === "python" ? "py" : "tsx"}
                  </span>
                  <span>Click a line number to flag it for review</span>
                </div>
                <div className="overflow-x-auto p-4">
                  {selectedChallenge.code_snippet
                    .split("\n")
                    .map((line, idx) => {
                      const lineNum = idx + 1
                      const isFlagged = flaggedLine === lineNum
                      return (
                        <div
                          key={lineNum}
                          onClick={() => setFlaggedLine(lineNum)}
                          className={`flex cursor-pointer items-center gap-4 rounded px-2 py-0.5 transition-colors ${
                            isFlagged
                              ? "bg-red-950/70 text-red-200"
                              : "hover:bg-zinc-900/60"
                          }`}
                        >
                          <span
                            className={`w-6 text-right select-none ${
                              isFlagged
                                ? "font-bold text-red-400"
                                : "text-zinc-600"
                            }`}
                          >
                            {lineNum}
                          </span>
                          <pre className="overflow-visible font-mono text-xs">
                            {line || " "}
                          </pre>
                        </div>
                      )
                    })}
                </div>
              </div>

              {/* Review input */}
              <Card className="flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    Your Review Finding
                  </span>
                  {flaggedLine ? (
                    <Badge
                      variant="outline"
                      className="border-red-500/30 text-xs text-red-400"
                    >
                      Flagged Line {flaggedLine}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      Select a line in the snippet above to flag
                    </span>
                  )}
                </div>

                <Textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Explain the security defect, agent hallucination, or bad pattern..."
                  rows={3}
                  className="font-sans text-xs"
                />

                <div className="flex justify-end">
                  <Button
                    onClick={handleReviewSubmit}
                    disabled={
                      submitting || flaggedLine === null || !comments.trim()
                    }
                    size="sm"
                  >
                    {submitting ? "Evaluating..." : "Submit Review"}
                  </Button>
                </div>
              </Card>

              {/* Review Evaluation Result */}
              {reviewResult && (
                <Card
                  className={`border p-4 ${
                    reviewResult.score >= 80
                      ? "border-emerald-500/50 bg-emerald-950/10"
                      : reviewResult.score >= 40
                        ? "border-amber-500/50 bg-amber-950/10"
                        : "border-red-500/50 bg-red-950/10"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      Review Evaluation Score
                    </span>
                    <Badge
                      variant={reviewResult.score >= 80 ? "default" : "outline"}
                      className="font-mono text-sm"
                    >
                      {reviewResult.score} / 100
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-2 text-xs">
                    {reviewResult.feedback}
                  </p>
                  {reviewResult.detected_issues.length > 0 && (
                    <ul className="text-foreground/90 mt-3 list-inside list-disc space-y-1 text-xs">
                      {reviewResult.detected_issues.map((issue, idx) => (
                        <li key={idx}>{issue}</li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}
            </>
          ) : (
            <div className="text-muted-foreground p-8 text-center text-sm">
              Loading challenges...
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
