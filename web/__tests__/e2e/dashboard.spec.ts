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

  await expect(page.getByText("Running agents")).toBeVisible();
  await expect(page.getByText("Blocked / Failed")).toBeVisible();
  await expect(page.getByText("Success rate")).toBeVisible();
  await expect(page.getByText("Avg duration")).toBeVisible();
  await expect(page.getByText("Total cost")).toBeVisible();

  await expect(page.locator(".card-value").nth(0)).toHaveText("2");
  await expect(page.locator(".card-value").nth(1)).toHaveText("0");
  await expect(page.locator(".card-value").nth(2)).toHaveText("85%");
  await expect(page.locator(".card-value").nth(4)).toHaveText("$45.50");
});

test("renders sessions table with rows", async ({ page }) => {
  await page.goto("/");
  const table = page.locator(".table");
  await expect(table).toBeVisible();
  const rows = page.locator(".table-row");
  await expect(rows).toHaveCount(1);
  await expect(page.getByText("ENG-55")).toBeVisible();
});

test("sidebar navigation links present", async ({ page }) => {
  await page.goto("/");
  const sidebar = page.locator(".sidebar");
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByText("Dashboard")).toBeVisible();
  await expect(sidebar.getByText("Tokens")).toBeVisible();
  await expect(sidebar.getByText("Issues")).toBeVisible();
});
