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
  const headers = page.locator(".kanban-header-label");
  await expect(headers).toHaveCount(4);
  await expect(headers.nth(0)).toContainText("Todo");
  await expect(headers.nth(1)).toContainText("Working");
  await expect(headers.nth(2)).toContainText("Done");
  await expect(headers.nth(3)).toContainText("Cancel");

  const columns = page.locator(".kanban-column");
  await expect(columns).toHaveCount(4);
});

test("cards appear in correct columns", async ({ page }) => {
  await page.goto("/issues");

  const todoColumn = page.locator(".kanban-column").nth(0);
  await expect(todoColumn.getByText("ENG-55")).toBeVisible();
  await expect(todoColumn.getByText("Test issue todo")).toBeVisible();

  const workingColumn = page.locator(".kanban-column").nth(1);
  await expect(workingColumn.getByText("ENG-56")).toBeVisible();

  const doneColumn = page.locator(".kanban-column").nth(2);
  await expect(doneColumn.getByText("ENG-57")).toBeVisible();
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
  await page.locator(".kanban-card").filter({ hasText: "ENG-55" }).click();
  await expect(page).toHaveURL(/\/issues\/ENG-55/);
});

test("New Issue button visible", async ({ page }) => {
  await page.goto("/issues");
  await expect(page.getByText("New Issue")).toBeVisible();
});

test("+ button on Todo column visible", async ({ page }) => {
  await page.goto("/issues");
  const addBtn = page.locator(".kanban-add-btn");
  await expect(addBtn).toBeVisible();
  await expect(addBtn).toHaveText("+");
});
