import { test, expect } from "@playwright/test";
import { mockIssueDetail } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/issues/ENG-55", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: mockIssueDetail });
    }
    return route.continue();
  });
  await page.route("**/api/issues/states", (route) =>
    route.fulfill({
      json: {
        states: [
          { id: "s1", name: "Todo", type: "unstarted", color: "#e2e2e2", position: 0 },
          { id: "s2", name: "In Progress", type: "started", color: "#f59e0b", position: 1 },
          { id: "s3", name: "Done", type: "completed", color: "#22c55e", position: 2 },
        ],
      },
    }),
  );
});

test("displays title as h1", async ({ page }) => {
  await page.goto("/issues/ENG-55");
  const title = page.locator("h1");
  await expect(title).toHaveText("Add Playwright E2E smoke tests");
});

test("description area present", async ({ page }) => {
  await page.goto("/issues/ENG-55");
  const main = page.locator(".detail-main");
  await expect(main).toContainText("Implement E2E smoke tests for all dashboard pages.");
});

test("sidebar shows status, priority, labels", async ({ page }) => {
  await page.goto("/issues/ENG-55");
  const sidebar = page.locator(".detail-sidebar");
  await expect(sidebar).toContainText("Status");
  await expect(sidebar).toContainText("Todo");
  await expect(sidebar).toContainText("Priority");
  await expect(sidebar).toContainText("Labels");
  await expect(sidebar).toContainText("feature");
});

test("back link present with correct href", async ({ page }) => {
  await page.goto("/issues/ENG-55");
  const backLink = page.locator(".detail-back");
  await expect(backLink).toContainText("Issues");
  await expect(backLink).toHaveAttribute("href", "/issues");
});

test("Open in Linear link present", async ({ page }) => {
  await page.goto("/issues/ENG-55");
  const linearLink = page.locator(`a[href="${mockIssueDetail.issue.url}"]`);
  await expect(linearLink).toContainText("Open in Linear");
});
