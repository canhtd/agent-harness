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
  await expect(
    page.getByText("Implement E2E smoke tests for all dashboard pages."),
  ).toBeVisible();
});

test("sidebar shows status, priority, labels", async ({ page }) => {
  await page.goto("/issues/ENG-55");
  const sidebar = page.locator(".detail-sidebar");
  await expect(sidebar.getByText("Status")).toBeVisible();
  await expect(sidebar.getByText("Todo")).toBeVisible();
  await expect(sidebar.getByText("Priority")).toBeVisible();
  await expect(sidebar.getByText("High")).toBeVisible();
  await expect(sidebar.getByText("Labels")).toBeVisible();
  await expect(sidebar.getByText("feature")).toBeVisible();
});

test("back link navigates to /issues", async ({ page }) => {
  await page.route("**/api/issues", (route) =>
    route.fulfill({ json: { issues: [] } }),
  );

  await page.goto("/issues/ENG-55");
  const backLink = page.getByText("← Issues");
  await expect(backLink).toBeVisible();
  await backLink.click();
  await expect(page).toHaveURL(/\/issues$/);
});

test("Open in Linear link present", async ({ page }) => {
  await page.goto("/issues/ENG-55");
  const linearLink = page.getByText("Open in Linear →");
  await expect(linearLink).toBeVisible();
  await expect(linearLink).toHaveAttribute("href", mockIssueDetail.issue.url);
});
