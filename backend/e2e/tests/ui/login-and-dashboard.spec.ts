import { test, expect } from "@playwright/test";
import { loadState, E2EState } from "../api/state";

/**
 * Browser-level smoke tests for the built frontend pages. Only Login,
 * ChangePassword, Dashboard, Users, and Organizations exist yet
 * (Employee/Vendor/Inventory/Procurement are API-only so far - see
 * docs/modules/02-transactional-modules.md "Next up"), so this suite is
 * intentionally narrower than the API suite; it exists to catch UI-layer
 * regressions (broken auth wiring, routing, form submission) that the API
 * tests can't see.
 */
test.describe.serial("Frontend smoke test", () => {
  let state: E2EState;

  test.beforeAll(() => {
    state = loadState();
  });

  test("Rejects an invalid login with a visible error, without navigating away", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("nonexistent-user");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText(/invalid username or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("Logs in as the org admin and reaches the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill(state.orgAdmin.username);
    await page.getByLabel("Password").fill(state.orgAdmin.password);
    await page.getByRole("button", { name: /sign in/i }).click();

    // global.setup.ts already completed this admin's forced password change,
    // so login should go straight to the dashboard, not /change-password.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(new RegExp(`Welcome, ${state.orgAdmin.username}`, "i"))).toBeVisible();
  });

  test("Sidebar does not show the Organizations link for a non-Super-Admin", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill(state.orgAdmin.username);
    await page.getByLabel("Password").fill(state.orgAdmin.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/$/);

    await expect(page.getByRole("link", { name: "Organizations" })).toHaveCount(0);
  });

  test("Users page lists the users provisioned by global.setup.ts", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill(state.orgAdmin.username);
    await page.getByLabel("Password").fill(state.orgAdmin.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole("link", { name: "Users" }).click();
    await expect(page).toHaveURL(/\/users/);
    await expect(page.getByText(state.users.hr.username)).toBeVisible();
    await expect(page.getByText(state.users.storeKeeper.username)).toBeVisible();
  });

  test("Logging out returns to the login screen and blocks the dashboard again", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill(state.orgAdmin.username);
    await page.getByLabel("Password").fill(state.orgAdmin.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole("button", { name: /log out/i }).click();
    await expect(page).toHaveURL(/\/login/);

    // Directly requesting a protected route after logout must redirect back to /login.
    await page.goto("/users");
    await expect(page).toHaveURL(/\/login/);
  });
});
