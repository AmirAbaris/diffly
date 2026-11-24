import { describe, expect, it } from "vitest"

import {
  buildCoachSystemPrompt,
  COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
  ConfigureChallengeInputSchema,
  ConfigureChallengeOutputSchema,
  createCoachTools,
  normalizeConfigureChallengeInput,
  parseCoachRequest,
} from "@/lib/ai/coach"

const USER_MSG = {
  role: "user" as const,
  parts: [{ type: "text" as const, text: "Create a custom challenge for me" }],
}

describe("lib/ai/coach-challenge-config", () => {
  it("registers configure_challenge without execute and validates input/output schemas", () => {
    const tools = createCoachTools()
    expect(tools[COACH_CONFIGURE_CHALLENGE_TOOL_NAME]).toBeDefined()
    expect(tools[COACH_CONFIGURE_CHALLENGE_TOOL_NAME].execute).toBeUndefined()

    expect(
      ConfigureChallengeInputSchema.safeParse({
        prompt: "Configure your Rust drill",
        language: "rust",
        difficulty: "Hard",
        suggestedTopics: [
          { label: "Lock across await", topic: "MutexGuard held across await" },
        ],
      }).success
    ).toBe(true)

    expect(
      ConfigureChallengeOutputSchema.safeParse({
        status: "created",
        slug: "rust-lock",
        title: "Rust Lock Ordering",
        language: "rust",
        difficulty: "Hard",
        topic: "MutexGuard held across await",
      }).success
    ).toBe(true)
    expect(
      ConfigureChallengeOutputSchema.safeParse({ status: "cancelled" }).success
    ).toBe(true)
    expect(
      ConfigureChallengeOutputSchema.safeParse({
        status: "quota_full",
        quotaLimit: 5,
      }).success
    ).toBe(true)
  })

  it("normalizes configure_challenge input, deduplicates topics, and provides language defaults", () => {
    const partial = normalizeConfigureChallengeInput({
      prompt: "  Pick\na\x00 topic  ",
      language: "Rust" as "rust",
      difficulty: "hard" as "Hard",
      topic: "ab",
      suggestedTopics: [
        { label: "Async lock", topic: "MutexGuard\nacross await" },
        { label: "Duplicate", topic: "mutexguard across await" },
        { label: "Short", topic: "no" },
      ],
    })
    expect(partial.prompt).toBe("Pick a topic")
    expect(partial.prefilled).toEqual({ language: "rust", difficulty: "Hard" })
    expect(partial.missingFields).toEqual(["topic"])
    expect(partial.suggestedTopics).toEqual([
      { label: "Async lock", topic: "MutexGuard across await" },
    ])

    const fallback = normalizeConfigureChallengeInput({ language: "go" })
    expect(fallback.missingFields).toEqual(["difficulty", "topic"])
    expect(fallback.suggestedTopics.length).toBeGreaterThanOrEqual(3)

    const empty = normalizeConfigureChallengeInput(undefined)
    expect(empty.missingFields).toEqual(["language", "difficulty", "topic"])
    expect(empty.suggestedTopics.length).toBeGreaterThanOrEqual(3)
  })

  it("accepts tool-configure_challenge parts in parseCoachRequest and includes prompt instructions", () => {
    const req = parseCoachRequest({
      mode: "patterns",
      messages: [
        USER_MSG,
        {
          id: "a-cfg",
          role: "assistant",
          parts: [
            {
              type: "tool-configure_challenge",
              toolCallId: "cfg-1",
              state: "output-available",
              input: { language: "go" },
              output: { status: "cancelled" },
            },
          ],
        },
      ],
    })
    expect(req.ok).toBe(true)

    const patternsPrompt = buildCoachSystemPrompt({
      mode: "patterns",
      patterns: {
        total_submissions: 0,
        total_missed_submissions: 0,
        weakest_slices: [],
        strongest_slices: [],
        recent_missed: [],
      },
    })
    expect(patternsPrompt).toContain("configure_challenge")
    expect(patternsPrompt).toContain('status: "created"')

    const debriefPrompt = buildCoachSystemPrompt({
      mode: "debrief",
      context: {
        challengeSlug: "auth-bypass",
        userFlaggedLines: [],
        userComments: "",
      },
    })
    expect(debriefPrompt).toContain("configure_challenge")
  })
})
