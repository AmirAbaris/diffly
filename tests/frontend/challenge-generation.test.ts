import { describe, expect, it } from "vitest"

import {
  buildChallengeGenerationPrompt,
  type GeneratedChallenge,
  parseGenerateChallengePayload,
  validateGeneratedChallengeQuality,
} from "@/lib/ai/challenge-generation"

const VALID_CHALLENGE: GeneratedChallenge = {
  slug: "order-lookup-service",
  title: "Order Lookup Service",
  difficulty: "Medium",
  category: "Security",
  language: "python",
  description: "Review the order lookup helper before merging into billing.",
  threat_model:
    "An authenticated caller can read arbitrary customer records across tenants.",
  defect_target:
    "Identify 1 High-Severity data access defect in query handling.",
  code_snippet: [
    "def get_order(cursor, order_id: str):",
    '    query = f"SELECT * FROM orders WHERE id = {order_id}"',
    "    cursor.execute(query)",
    "    return cursor.fetchone()",
  ].join("\n"),
  expected_issues: [
    {
      id: "sql-injection",
      title: "SQL Injection via f-string",
      severity: "high",
      anchor_lines: ['query = f"SELECT * FROM orders WHERE id = {order_id}"'],
      matched_lines: [2],
      matched_keywords: [
        "sql injection",
        "parameterized",
        "interpolation",
        "bind parameters",
      ],
      explanation: "User input is interpolated directly into the SQL string.",
    },
  ],
  hints: [
    {
      tier: 1,
      label: "Contextual Clue",
      text: "Inspect how caller input flows into the database query.",
    },
    {
      tier: 2,
      label: "Vulnerability Class",
      text: "Check for unsanitized string interpolation in SQL execution.",
    },
    {
      tier: 3,
      label: "Line Pointer",
      text: "Check line 2 and replace string interpolation with bind parameters.",
    },
  ],
  canonical_review: "Use parameterized queries instead of f-strings.",
  recommended_fix_diff:
    '--- a/orders.py\n+++ b/orders.py\n@@ -1,4 +1,4 @@\n def get_order(cursor, order_id: str):\n-    query = f"SELECT * FROM orders WHERE id = {order_id}"\n-    cursor.execute(query)\n+    cursor.execute("SELECT * FROM orders WHERE id = %s", (order_id,))\n     return cursor.fetchone()',
}

describe("validateGeneratedChallengeQuality", () => {
  it("accepts a valid challenge", () => {
    expect(validateGeneratedChallengeQuality(VALID_CHALLENGE)).toEqual({
      ok: true,
    })
  })

  it("rejects out-of-bounds matched_lines", () => {
    const result = validateGeneratedChallengeQuality({
      ...VALID_CHALLENGE,
      expected_issues: [
        {
          ...VALID_CHALLENGE.expected_issues[0],
          matched_lines: [0, 9],
        },
      ],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasons.some((r) => r.includes("out-of-bounds"))).toBe(true)
    }
  })

  it("rejects hallucinated anchor_lines not present in code_snippet", () => {
    const result = validateGeneratedChallengeQuality({
      ...VALID_CHALLENGE,
      expected_issues: [
        {
          ...VALID_CHALLENGE.expected_issues[0],
          anchor_lines: ["cursor.execute(f'DELETE FROM orders')"],
        },
      ],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasons.some((r) => r.includes("verbatim"))).toBe(true)
    }
  })

  it("rejects spoiler comments in code_snippet", () => {
    const result = validateGeneratedChallengeQuality({
      ...VALID_CHALLENGE,
      code_snippet: [
        "def get_order(cursor, order_id: str):",
        "    # VULNERABLE: SQL injection here",
        '    query = f"SELECT * FROM orders WHERE id = {order_id}"',
        "    cursor.execute(query)",
        "    return cursor.fetchone()",
      ].join("\n"),
      expected_issues: [
        {
          ...VALID_CHALLENGE.expected_issues[0],
          matched_lines: [3],
        },
      ],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasons.some((r) => r.includes("spoiler"))).toBe(true)
    }
  })

  it("rejects missing hint tiers", () => {
    const result = validateGeneratedChallengeQuality({
      ...VALID_CHALLENGE,
      hints: VALID_CHALLENGE.hints.filter((hint) => hint.tier !== 2),
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasons.some((r) => r.includes("tier 2"))).toBe(true)
    }
  })

  it("rejects line-number leaks in Tier 1 and Tier 2 hints", () => {
    const result = validateGeneratedChallengeQuality({
      ...VALID_CHALLENGE,
      hints: [
        { tier: 1, label: "Contextual Clue", text: "Look closely at line 2." },
        {
          tier: 2,
          label: "Vulnerability Class",
          text: "SQL injection on lines 2 and 3.",
        },
        VALID_CHALLENGE.hints[2],
      ],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasons.some((r) => r.includes("Tier 1"))).toBe(true)
      expect(result.reasons.some((r) => r.includes("Tier 2"))).toBe(true)
    }
  })

  it("rejects spoiler vulnerability names in slug", () => {
    const result = validateGeneratedChallengeQuality({
      ...VALID_CHALLENGE,
      slug: "webhook-dispatcher-ssrf",
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasons.some((r) => r.includes("slug"))).toBe(true)
    }
  })

  it("rejects matched_keywords that only copy code tokens from anchor_lines", () => {
    const result = validateGeneratedChallengeQuality({
      ...VALID_CHALLENGE,
      code_snippet:
        "response = await self.client.post(webhook_url, json=payload)",
      expected_issues: [
        {
          ...VALID_CHALLENGE.expected_issues[0],
          anchor_lines: [
            "response = await self.client.post(webhook_url, json=payload)",
          ],
          matched_lines: [1],
          matched_keywords: [
            "client.post",
            "webhook_url",
            "json",
            "payload",
            "await",
          ],
        },
      ],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasons.some((r) => r.includes("matched_keywords"))).toBe(
        true
      )
    }
  })

  it("rejects empty or non-diff recommended_fix_diff", () => {
    const emptyDiff = validateGeneratedChallengeQuality({
      ...VALID_CHALLENGE,
      recommended_fix_diff: "   ",
    })
    const plainTextDiff = validateGeneratedChallengeQuality({
      ...VALID_CHALLENGE,
      recommended_fix_diff: "Use parameterized queries instead of f-strings.",
    })

    expect(emptyDiff.ok).toBe(false)
    expect(plainTextDiff.ok).toBe(false)
    if (!plainTextDiff.ok) {
      expect(
        plainTextDiff.reasons.some((r) => r.includes("recommended_fix_diff"))
      ).toBe(true)
    }
  })
})

describe("buildChallengeGenerationPrompt", () => {
  it("includes difficulty guidance and anti-spoiler, realism, and grading rules", () => {
    const prompt = buildChallengeGenerationPrompt({
      topic: "Webhook signature verification",
      language: "typescript",
      difficulty: "Hard",
    })

    expect(prompt).toContain("JSON")
    expect(prompt).toContain("Agent Antipaths")
    expect(prompt).toContain("2 subtle defects involving state, concurrency")
    expect(prompt).toContain("Anti-Spoiler Metadata")
    expect(prompt).toContain("slug")
    expect(prompt).toContain("Code Realism & Cleanliness")
    expect(prompt).toContain("Grading Precision")
    expect(prompt).toContain("review concepts")
    expect(prompt).toContain("Progressive Hints")
    expect(prompt).not.toContain("Previous Attempt Corrections:")
  })

  it("appends Previous Attempt Corrections when previousIssues is provided", () => {
    const prompt = buildChallengeGenerationPrompt(
      {
        topic: "Webhook signature verification",
        language: "typescript",
        difficulty: "Easy",
      },
      {
        previousIssues: [
          "Tier 1 hint must not leak explicit line numbers.",
          "code_snippet must not contain spoiler comments.",
        ],
      }
    )

    expect(prompt).toContain("1 clear, realistic defect in a focused service")
    expect(prompt).toContain("Previous Attempt Corrections:")
    expect(prompt).toContain(
      "- Tier 1 hint must not leak explicit line numbers."
    )
    expect(prompt).toContain(
      "- code_snippet must not contain spoiler comments."
    )
  })
})

describe("parseGenerateChallengePayload", () => {
  it("accepts csharp as a valid challenge language", () => {
    const parsed = parseGenerateChallengePayload({
      topic: "EF Core FromSqlRaw interpolation",
      language: "csharp",
      difficulty: "Medium",
    })

    expect(parsed).toEqual({
      ok: true,
      value: {
        topic: "EF Core FromSqlRaw interpolation",
        language: "csharp",
        difficulty: "Medium",
      },
    })
  })

  it("lists all supported languages including csharp when rejecting an invalid language", () => {
    const parsed = parseGenerateChallengePayload({
      topic: "EF Core FromSqlRaw interpolation",
      language: "ruby",
      difficulty: "Medium",
    })

    expect(parsed).toEqual({
      ok: false,
      message:
        "Language must be python, typescript, go, rust, java, or csharp.",
    })
  })
})
