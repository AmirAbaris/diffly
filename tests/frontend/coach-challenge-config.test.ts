import { describe, expect, it } from "vitest"

import {
  buildCoachSystemPrompt,
  COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
  ConfigureChallengeInputSchema,
  ConfigureChallengeOutputSchema,
  createCoachTools,
  getDefaultTopicsForLanguage,
  getTopicsForLanguage,
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

  it("normalizes input as optional recommendations, deduplicates topics, and prepends recommended topic", () => {
    const partial = normalizeConfigureChallengeInput({
      prompt: "  Pick\na\x00 topic  ",
      language: "Rust" as "rust",
      difficulty: "hard" as "Hard",
      topic: "Tokio channel deadlock",
      suggestedTopics: [
        { label: "Async lock", topic: "MutexGuard\nacross await" },
        { label: "Duplicate", topic: "mutexguard across await" },
        { label: "Short", topic: "no" },
      ],
    })
    expect(partial.prompt).toBe("Pick a topic")
    expect(partial.recommended).toEqual({
      language: "rust",
      difficulty: "Hard",
      topic: "Tokio channel deadlock",
    })
    expect(partial.hasCustomSuggestedTopics).toBe(true)
    expect(partial.suggestedTopics).toEqual([
      { label: "Tokio channel deadlock", topic: "Tokio channel deadlock" },
      { label: "Async lock", topic: "MutexGuard across await" },
    ])

    const empty = normalizeConfigureChallengeInput(undefined)
    expect(empty.recommended).toEqual({})
    expect(empty.hasCustomSuggestedTopics).toBe(false)
    expect(empty.suggestedTopics.length).toBeGreaterThanOrEqual(3)
  })

  it("resolves language-matched topics when the user picks a different language", () => {
    const pythonSuggested = normalizeConfigureChallengeInput({
      language: "python",
      suggestedTopics: [
        { label: "Flask IDOR", topic: "IDOR in Python Flask route" },
      ],
    })

    expect(getTopicsForLanguage(pythonSuggested, "python")).toEqual([
      { label: "Flask IDOR", topic: "IDOR in Python Flask route" },
    ])
    expect(getTopicsForLanguage(pythonSuggested, "go")).toEqual(
      getDefaultTopicsForLanguage("go")
    )

    const agnostic = normalizeConfigureChallengeInput({
      suggestedTopics: [
        { label: "Auth bypass", topic: "Missing auth check on admin endpoint" },
      ],
    })
    expect(getTopicsForLanguage(agnostic, "go")).toEqual([
      { label: "Auth bypass", topic: "Missing auth check on admin endpoint" },
    ])

    const noCustom = normalizeConfigureChallengeInput(undefined)
    expect(getTopicsForLanguage(noCustom, "rust")).toEqual(
      getDefaultTopicsForLanguage("rust")
    )
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
    expect(patternsPrompt).toContain(
      "OMIT `language`, `difficulty`, and `topic`"
    )
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
