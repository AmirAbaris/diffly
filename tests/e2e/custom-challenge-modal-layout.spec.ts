import { expect, test } from "@playwright/test"

const MOCK_CUSTOM_CHALLENGES = {
  items: [
    {
      id: 101,
      slug: "nextjs-server-actions-idor-authorization-bypass-custom",
      title:
        "Next.js Server Actions IDOR Authorization Bypass Across Multi-Tenant Billing Endpoints",
      difficulty: "Hard",
      category: "Agent Antipaths",
      language: "typescript",
      description:
        "Server action trusts a client-supplied organizationId without checking session membership or role permissions before mutating invoice records.",
      estimated_minutes: 8,
      line_count: 46,
      total_hints: 3,
      is_solved: true,
      best_score: 92,
      is_shared: true,
      share_token: "tok_share_123456",
    },
    {
      id: 102,
      slug: "fastapi-async-db-session-leak-custom",
      title: "FastAPI Async SQLAlchemy Session Leak Under Concurrent Retries",
      difficulty: "Medium",
      category: "Concurrency",
      language: "python",
      description:
        "Shared AsyncSession instance across concurrent gather tasks causes intermittent IllegalStateChangeError and uncommitted partial writes.",
      estimated_minutes: 6,
      line_count: 34,
      total_hints: 3,
      is_solved: false,
      best_score: null,
      is_shared: false,
      share_token: null,
    },
  ],
  total: 2,
  quota_limit: 5,
  quota_remaining: 3,
}

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const

test.describe("Custom Challenge Generator Modal - Manage Library Layout", () => {
  for (const viewport of VIEWPORTS) {
    test(`does not overflow horizontally with existing custom challenges on ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      })

      await page.route("**/api/challenges/custom", async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(MOCK_CUSTOM_CHALLENGES),
          })
          return
        }
        await route.continue()
      })

      await page.goto("/challenges")
      await page.getByTestId("generate-ai-challenge-btn").click()

      const modal = page.getByTestId("custom-challenge-modal-content")
      await expect(modal).toBeVisible()

      await page.getByTestId("tab-manage-trigger").click()
      const list = page.getByTestId("custom-challenges-list")
      await expect(list).toBeVisible()
      await expect(page.getByTestId("custom-challenge-item-101")).toBeVisible()

      const metrics = await page.evaluate(() => {
        const modalEl = document.querySelector<HTMLElement>(
          '[data-testid="custom-challenge-modal-content"]'
        )
        const tabsEl = modalEl?.querySelector<HTMLElement>('[data-slot="tabs"]')
        const tabsContentEl = modalEl?.querySelector<HTMLElement>(
          '[data-slot="tabs-content"][data-state="active"]'
        )
        const listEl = document.querySelector<HTMLElement>(
          '[data-testid="custom-challenges-list"]'
        )
        const items = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-testid^="custom-challenge-item-"]'
          )
        )

        const modalRect = modalEl?.getBoundingClientRect()
        return {
          modal: modalEl
            ? {
                clientWidth: modalEl.clientWidth,
                scrollWidth: modalEl.scrollWidth,
                overflowX: modalEl.scrollWidth - modalEl.clientWidth,
                rectRight: modalRect?.right ?? 0,
              }
            : null,
          tabs: tabsEl
            ? {
                clientWidth: tabsEl.clientWidth,
                scrollWidth: tabsEl.scrollWidth,
              }
            : null,
          tabsContent: tabsContentEl
            ? {
                clientWidth: tabsContentEl.clientWidth,
                scrollWidth: tabsContentEl.scrollWidth,
              }
            : null,
          list: listEl
            ? {
                clientWidth: listEl.clientWidth,
                scrollWidth: listEl.scrollWidth,
              }
            : null,
          items: items.map((el) => {
            const rect = el.getBoundingClientRect()
            return {
              testId: el.dataset.testid,
              clientWidth: el.clientWidth,
              scrollWidth: el.scrollWidth,
              clipsRightBy: modalRect
                ? Math.round(rect.right - modalRect.right)
                : 0,
            }
          }),
        }
      })

      expect(
        metrics.modal?.overflowX,
        `Modal horizontal overflow on ${viewport.name}: ${JSON.stringify(metrics)}`
      ).toBeLessThanOrEqual(0)

      expect(
        metrics.list && metrics.list.scrollWidth - metrics.list.clientWidth,
        `List horizontal overflow on ${viewport.name}: ${JSON.stringify(metrics)}`
      ).toBeLessThanOrEqual(0)

      for (const item of metrics.items) {
        expect(
          item.scrollWidth - item.clientWidth,
          `Item ${item.testId} horizontal overflow on ${viewport.name}: ${JSON.stringify(metrics)}`
        ).toBeLessThanOrEqual(0)
        expect(
          item.clipsRightBy,
          `Item ${item.testId} extends past modal right edge on ${viewport.name}: ${JSON.stringify(metrics)}`
        ).toBeLessThanOrEqual(0)
      }
    })
  }
})
