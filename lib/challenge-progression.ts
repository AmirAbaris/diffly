import type { ChallengeDetail, ChallengeSummary } from "@/types/challenge"

export interface NextChallengeInput {
  currentSlug: string
  currentChallenge?: ChallengeDetail
  publicChallenges: ChallengeSummary[]
  customChallenges: ChallengeSummary[]
}

function pickRecommendedPublicChallenge(
  publicChallenges: ChallengeSummary[],
  currentSlug: string,
  currentChallenge?: ChallengeDetail
): string | null {
  const candidates = publicChallenges.filter((c) => c.slug !== currentSlug)
  if (candidates.length === 0) {
    return null
  }

  if (currentChallenge) {
    const exactMatch = candidates.find(
      (c) =>
        !c.is_solved &&
        c.category === currentChallenge.category &&
        c.language === currentChallenge.language
    )
    if (exactMatch) {
      return exactMatch.slug
    }

    const categoryMatch = candidates.find(
      (c) => !c.is_solved && c.category === currentChallenge.category
    )
    if (categoryMatch) {
      return categoryMatch.slug
    }

    const languageMatch = candidates.find(
      (c) => !c.is_solved && c.language === currentChallenge.language
    )
    if (languageMatch) {
      return languageMatch.slug
    }

    const difficultyMatch = candidates.find(
      (c) => !c.is_solved && c.difficulty === currentChallenge.difficulty
    )
    if (difficultyMatch) {
      return difficultyMatch.slug
    }
  }

  const firstUnsolved = candidates.find((c) => !c.is_solved)
  if (firstUnsolved) {
    return firstUnsolved.slug
  }

  return candidates[0]?.slug ?? null
}

/**
 * Computes the next challenge slug for both public catalog and custom challenges.
 * Custom challenges advance through the user's custom library before falling back
 * to a recommended public challenge.
 */
export function resolveNextChallengeSlug({
  currentSlug,
  currentChallenge,
  publicChallenges,
  customChallenges,
}: NextChallengeInput): string | null {
  const isCustom = currentChallenge?.is_public === false

  if (!isCustom) {
    const publicIndex = publicChallenges.findIndex(
      (c) =>
        c.slug === currentSlug ||
        (currentChallenge?.id !== undefined && c.id === currentChallenge.id)
    )
    if (publicIndex >= 0 && publicIndex < publicChallenges.length - 1) {
      return publicChallenges[publicIndex + 1].slug
    }
    if (publicIndex >= 0) {
      return null
    }
  }

  if (customChallenges.length > 0) {
    const customIndex = customChallenges.findIndex(
      (c) =>
        c.slug === currentSlug ||
        (currentChallenge?.id !== undefined && c.id === currentChallenge.id)
    )
    if (customIndex >= 0 && customIndex < customChallenges.length - 1) {
      return customChallenges[customIndex + 1].slug
    }
  }

  return pickRecommendedPublicChallenge(
    publicChallenges,
    currentSlug,
    currentChallenge
  )
}
