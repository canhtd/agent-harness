import { test, expect } from "@playwright/test";
import { mockIssues } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/issues", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { issues: mockIssues } });
    }
    return route.continue();
  });
});

test("renders 4 kanban columns", async ({ page }) => {
  await page.goto("/issues");
  const columns = page.locator(".kanban-column");
  await expect(columns).toHaveCount(4);
  await expect(columns.nth(0)).toContainText("Todo");
  await expect(columns.nth(1)).toContainText("Working");
  await expect(columns.nth(2)).toContainText("Done");
  await expect(columns.nth(3)).toContainText("Cancel");
});

test("cards appear in correct columns", async ({ page }) => {
  await page.goto("/issues");
  const columns = page.locator(".kanban-column");

  await expect(columns.nth(0)).toContainText("ENG-55");
  await expect(columns.nth(0)).toContainText("Test issue todo");

  await expect(columns.nth(1)).toContainText("ENG-56");

  await expect(columns.nth(2)).toContainText("ENG-57");
});

test("card click navigates to issue detail", async ({ page }) => {
  await page.route("**/api/issues/ENG-55", (route) =>
    route.fulfill({
      json: {
        issue: {
          id: "1",
          identifier: "ENG-55",
          title: "Test issue todo",
          description: null,
          priority: 2,
          url: "https://linear.app/team/issue/ENG-55",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          state: { id: "s1", name: "Todo", type: "unstarted", color: "#e2e2e2" },
          labels: [],
          assignee: null,
        },
      },
    }),
  );

  await page.goto("/issues");
  const card = page.locator(".kanban-card").filter({ hasText: "ENG-55" });
  await card.click();
  await expect(page).toHaveURL(/\/issues\/ENG-55/);
});

test("New Issue button visible", async ({ page }) => {
  await page.goto("/issues");
  const btn = page.locator("text=New Issue");
  await expect(btn).toBeAttached();
});

test("+ button on Todo column visible", async ({ page }) => {
  await page.goto("/issues");
  const addBtn = page.locator(".kanban-add-btn");
  await expect(addBtn).toBeAttached();
  await expect(addBtn).toContainText("+");
});
