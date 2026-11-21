import { expect, type Page, test } from "@playwright/test"

async function dismissFlaggingGuideIfOpen(page: Page) {
  const guideModal = page.getByTestId("flagging-guide-modal")
  try {
    await guideModal.waitFor({ state: "visible", timeout: 2_000 })
    await page.keyboard.press("Escape")
    await expect(guideModal).toBeHidden()
  } catch {
    // Modal did not auto-open (already dismissed in this browser context)
  }
}

test.describe("Diffly E2E Smoke Suite", () => {
  test("catalog loading and filtering", async ({ page }) => {
    await page.goto("/challenges")

    const grid = page.getByTestId("catalog-grid")
    await expect(grid).toBeVisible()

    const allCards = grid.locator("a[href^='/challenges/']")
    const initialCardCount = await allCards.count()
    expect(initialCardCount).toBeGreaterThan(0)

    const difficultyGroup = page.getByRole("radiogroup", {
      name: "Filter by difficulty",
    })
    await difficultyGroup.getByRole("radio", { name: "Hard" }).click()
    await expect(page).toHaveURL(/difficulty=Hard/)

    await expect(grid).toBeVisible()
    const hardCardCount = await allCards.count()
    expect(hardCardCount).toBeGreaterThan(0)
    expect(hardCardCount).toBeLessThanOrEqual(initialCardCount)

    const searchInput = page.getByLabel("Search challenges")
    await searchInput.fill("zzznomatch999")
    await expect(page.getByTestId("catalog-empty-state")).toBeVisible()

    await page.getByRole("button", { name: "Reset filters" }).first().click()
    await expect(page).toHaveURL(/\/challenges$/)
    await expect(grid).toBeVisible()
    expect(await allCards.count()).toBe(initialCardCount)
  })

  test("flagging lines, submitting a review, and viewing comparison diff", async ({
    page,
  }) => {
    await page.goto("/challenges")

    const firstReviewLink = page
      .getByTestId("catalog-grid")
      .getByRole("link", { name: "Review" })
      .first()
    await firstReviewLink.click()
    await expect(page).toHaveURL(/\/challenges\/.+/)

    await dismissFlaggingGuideIfOpen(page)

    const codeViewer = page.getByTestId("code-viewer")
    await expect(codeViewer).toBeVisible()

    await codeViewer
      .getByRole("button", { name: "Flag line 1", exact: true })
      .click()
    await expect(page.getByTestId("flagged-lines-container")).toContainText(
      "L1"
    )

    const critiqueInput = page.getByLabel("Review summary note")
    await critiqueInput.fill(
      "Line 1 introduces a potential security and correctness defect that lacks proper validation and error handling."
    )

    await page
      .getByTestId("review-summary-panel")
      .getByRole("button", { name: "Submit Review" })
      .click()

    const compareButton = page.getByTestId("view-canonical-solution-button")
    await expect(compareButton).toBeVisible()
    await compareButton.click()

    const comparisonView = page.getByTestId("comparison-view")
    await expect(comparisonView).toBeVisible()

    await page.getByTestId("toggle-diff-view").click()
    await expect(page.getByTestId("code-diff-viewer")).toBeVisible()
  })

  test("progressive hint persistence across page reload", async ({ page }) => {
    await page.goto("/challenges")
    await page
      .getByTestId("catalog-grid")
      .getByRole("link", { name: "Review" })
      .first()
      .click()

    await dismissFlaggingGuideIfOpen(page)

    const hintsSection = page.getByTestId("section-progressive-hints")
    await expect(hintsSection).toBeVisible()
    await expect(hintsSection).toContainText("0 of 3 Unlocked")

    await page.getByTestId("unlock-hint-btn-1").click()
    await expect(hintsSection).toContainText("1 of 3 Unlocked")
    await expect(page.getByTestId("hint-item-1")).toContainText("Unlocked")

    await page.reload()
    await dismissFlaggingGuideIfOpen(page)

    const hintsAfterReload = page.getByTestId("section-progressive-hints")
    await expect(hintsAfterReload).toBeVisible()
    await expect(hintsAfterReload).toContainText("1 of 3 Unlocked")
    await expect(page.getByTestId("hint-item-1")).toContainText("Unlocked")
  })

  test("guest-to-registered session claim", async ({ page }) => {
    await page.goto("/challenges")
    await page
      .getByTestId("catalog-grid")
      .getByRole("link", { name: "Review" })
      .first()
      .click()

    await dismissFlaggingGuideIfOpen(page)

    const codeViewer = page.getByTestId("code-viewer")
    await expect(codeViewer).toBeVisible()
    await codeViewer
      .getByRole("button", { name: "Flag line 28", exact: true })
      .click()

    await page
      .getByLabel("Review summary note")
      .fill(
        "Line 28 uses eval() on untrusted input with builtins exposed, enabling remote code execution (RCE); replace it with an ast parser."
      )

    await page
      .getByTestId("review-summary-panel")
      .getByRole("button", { name: "Submit Review" })
      .click()

    await expect(
      page.getByTestId("view-canonical-solution-button")
    ).toBeVisible()
    await page.getByRole("button", { name: "Close" }).click()
    await expect(
      page.getByTestId("view-canonical-solution-button")
    ).toBeHidden()

    const navStats = page.getByTestId("nav-stats-trigger").first()
    await expect(navStats).toContainText(/Solved\s*1\//)

    const suffix = Date.now().toString().slice(-6)
    const username = `e2e_user_${suffix}`
    const email = `e2e_${suffix}@diffly.dev`

    await page.getByTestId("register-button").first().click()
    await expect(page.getByTestId("auth-modal-content")).toBeVisible()

    await page.getByTestId("register-email-input").fill(email)
    await page.getByTestId("register-username-input").fill(username)
    await page.getByTestId("register-password-input").fill("DifflyPass123!")
    await page
      .getByTestId("register-confirm-password-input")
      .fill("DifflyPass123!")
    await page.getByTestId("sign-up-submit-button").click()

    const userNav = page.getByTestId("user-nav-authenticated").first()
    await expect(userNav).toBeVisible()
    await expect(userNav).toContainText(`@${username}`)

    await page.reload()
    await expect(
      page.getByTestId("user-nav-authenticated").first()
    ).toContainText(`@${username}`)
    await expect(page.getByTestId("nav-stats-trigger").first()).toContainText(
      /Solved\s*1\//
    )
  })
})
