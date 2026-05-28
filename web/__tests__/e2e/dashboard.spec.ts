import { test, expect } from "@playwright/test";
import { mockHealth } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: mockHealth }),
  );
});

test("renders all 5 metric cards", async ({ page }) => {
  await page.goto("/");
  const cards = page.locator(".card");
  await expect(cards).toHaveCount(5);

  await expect(cards.nth(0)).toContainText("Running agents");
  await expect(cards.nth(1)).toContainText("Blocked");
  await expect(cards.nth(2)).toContainText("Success rate");
  await expect(cards.nth(3)).toContainText("Avg duration");
  await expect(cards.nth(4)).toContainText("Total cost");

  await expect(cards.nth(0).locator(".card-value")).toHaveText("2");
  await expect(cards.nth(1).locator(".card-value")).toHaveText("0");
  await expect(cards.nth(2).locator(".card-value")).toHaveText("85%");
  await expect(cards.nth(4).locator(".card-value")).toHaveText("$45.50");
});

test("renders sessions table with rows", async ({ page }) => {
  await page.goto("/");
  const table = page.locator(".table");
  await expect(table).toBeVisible();
  const rows = page.locator(".table-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("ENG-55");
});

test("sidebar navigation links present", async ({ page }) => {
  await page.goto("/");
  const sidebar = page.locator(".sidebar");
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toContainText("Dashboard");
  await expect(sidebar).toContainText("Tokens");
  await expect(sidebar).toContainText("Issues");
});
