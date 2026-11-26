import { describe, expect, it } from "vitest"
import { escapeDelimitedTags } from "@/lib/ai/coach-prompts"

describe("escapeDelimitedTags", () => {
  it("escapes delimited tags with whitespace, attributes, and mixed case while leaving non-matching tags intact", () => {
    expect(
      escapeDelimitedTags(
        '< / code_under_review x="1"><code_under_review_extra>< user_critique><\t/CANONICAL_REVIEW>'
      )
    ).toBe(
      '&lt;/ code_under_review x="1"&gt;<code_under_review_extra>&lt;user_critique&gt;&lt;/CANONICAL_REVIEW&gt;'
    )
    expect(escapeDelimitedTags("plain text without tags")).toBe(
      "plain text without tags"
    )
    expect(escapeDelimitedTags("<code_under_review unclosed")).toBe(
      "<code_under_review unclosed"
    )
  })

  it("handles long whitespace runs after '<' in linear time without polynomial backtracking", () => {
    const spaces = " ".repeat(50_000)
    const payload = `<${spaces}<user_critique>`
    const startedAt = performance.now()

    expect(escapeDelimitedTags(payload)).toBe(`<${spaces}&lt;user_critique&gt;`)
    expect(performance.now() - startedAt).toBeLessThan(100)
  })
})
