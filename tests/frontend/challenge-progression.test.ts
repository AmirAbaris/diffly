import { describe, expect, it } from "vitest"
import { resolveNextChallengeSlug } from "@/lib/challenge-progression"
import type { ChallengeDetail, ChallengeSummary } from "@/types/challenge"

function makeSummary(
  id: number,
  slug: string,
  overrides?: Partial<ChallengeSummary>
): ChallengeSummary {
  return {
    id,
    slug,
    title: `Title ${slug}`,
    difficulty: "Medium",
    category: "Security",
    language: "python",
    description: `Desc ${slug}`,
    estimated_minutes: 5,
    line_count: 10,
    total_hints: 3,
    is_solved: false,
    best_score: null,
    is_public: true,
    ...overrides,
  }
}

function makeDetail(
  id: number,
  slug: string,
  overrides?: Partial<ChallengeDetail>
): ChallengeDetail {
  return {
    ...makeSummary(id, slug, overrides),
    threat_model: "Threat",
    defect_target: "Target",
    code_snippet: "x = 1\n",
    ...overrides,
  }
}

describe("resolveNextChallengeSlug", () => {
  const pub1 = makeSummary(1, "pub-conc-go", {
    category: "Concurrency",
    language: "go",
    is_solved: false,
  })
  const pub2 = makeSummary(2, "pub-sec-py", {
    category: "Security",
    language: "python",
    is_solved: false,
  })
  const pub3 = makeSummary(3, "pub-perf-ts", {
    category: "Performance",
    language: "typescript",
    is_solved: true,
  })

  it("advances linearly through public challenges and returns null on last public challenge", () => {
    expect(
      resolveNextChallengeSlug({
        currentSlug: "pub-conc-go",
        currentChallenge: makeDetail(1, "pub-conc-go"),
        publicChallenges: [pub1, pub2, pub3],
        customChallenges: [],
      })
    ).toBe("pub-sec-py")

    expect(
      resolveNextChallengeSlug({
        currentSlug: "pub-perf-ts",
        currentChallenge: makeDetail(3, "pub-perf-ts"),
        publicChallenges: [pub1, pub2, pub3],
        customChallenges: [],
      })
    ).toBeNull()
  })

  it("advances through owned custom challenges before falling back to recommended public challenge", () => {
    const custom1 = makeSummary(101, "custom-1", { is_public: false })
    const custom2 = makeSummary(102, "custom-2", { is_public: false })

    expect(
      resolveNextChallengeSlug({
        currentSlug: "custom-1",
        currentChallenge: makeDetail(101, "custom-1", { is_public: false }),
        publicChallenges: [pub1, pub2, pub3],
        customChallenges: [custom1, custom2],
      })
    ).toBe("custom-2")

    expect(
      resolveNextChallengeSlug({
        currentSlug: "custom-2",
        currentChallenge: makeDetail(102, "custom-2", {
          is_public: false,
          category: "Security",
          language: "python",
        }),
        publicChallenges: [pub1, pub2, pub3],
        customChallenges: [custom1, custom2],
      })
    ).toBe("pub-sec-py")
  })

  it("falls back to recommended public challenge for shared custom challenges without owned custom items", () => {
    expect(
      resolveNextChallengeSlug({
        currentSlug: "shared-custom-x",
        currentChallenge: makeDetail(201, "shared-custom-x", {
          is_public: false,
          is_owner: false,
          category: "Concurrency",
          language: "go",
        }),
        publicChallenges: [pub1, pub2, pub3],
        customChallenges: [],
      })
    ).toBe("pub-conc-go")
  })

  it("falls back to first public challenge if all public challenges are solved", () => {
    const solvedPub = makeSummary(1, "pub-solved", { is_solved: true })
    expect(
      resolveNextChallengeSlug({
        currentSlug: "custom-only",
        currentChallenge: makeDetail(101, "custom-only", { is_public: false }),
        publicChallenges: [solvedPub],
        customChallenges: [],
      })
    ).toBe("pub-solved")
  })
})
