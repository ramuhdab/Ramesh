import { test, expect } from "@playwright/test";
import { SUPER_ADMIN_USERNAME, SUPER_ADMIN_PASSWORD, RUN_ID } from "../api/helpers";

// Only used if the seeded account still needs its first-login change. Once a
// prior run has changed it, subsequent runs fall back to this value on login
// (see the retry below) - this makes the test idempotent across repeated
// runs against a persistent dev database, not just a freshly-seeded one.
const NEW_PASSWORD = "SuperAdminE2E1!";

/** Super Admin-only UI: the Organizations page (WF1 onboarding) via the browser. */
test.describe("Super Admin organization onboarding (UI)", () => {
  test("Super Admin sees the Organizations link and can onboard a new org from the browser", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill(SUPER_ADMIN_USERNAME);
    await page.getByLabel("Password").fill(SUPER_ADMIN_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // If a previous run already changed the password away from
    // SUPER_ADMIN_PASSWORD, retry once with NEW_PASSWORD before giving up.
    const invalidCreds = page.getByText(/invalid username or password/i);
    if (await invalidCreds.isVisible().catch(() => false)) {
      await page.getByLabel("Password").fill(NEW_PASSWORD);
      await page.getByRole("button", { name: /sign in/i }).click();
    }

    // A freshly-seeded Super Admin has mustChangePassword=true (prisma/seed.ts) and gets
    // redirected to /change-password on first login - handle that once, self-healing this
    // test instead of requiring the operator to pre-change it out of band.
    if (page.url().includes("/change-password")) {
      await page.getByLabel(/current.*password/i).fill(SUPER_ADMIN_PASSWORD);
      await page.getByLabel("New password").fill(NEW_PASSWORD);
      await page.getByRole("button", { name: /save/i }).click();
      await expect(page).toHaveURL(/\/$/);
    }

    await expect(page.getByRole("link", { name: "Organizations" })).toBeVisible();

    await page.getByRole("link", { name: "Organizations" }).click();
    await expect(page).toHaveURL(/\/organizations/);

    const orgName = `UI Test Org ${RUN_ID}`;
    await page.getByLabel("Organization name").fill(orgName);
    await page.getByLabel("Admin username").fill(`ui_admin_${RUN_ID}`);
    await page.getByLabel("Admin email").fill(`ui_admin_${RUN_ID}@example.com`);
    await page.getByRole("button", { name: /create organization/i }).click();

    await expect(page.getByText(new RegExp(`Organization "${orgName}" created`))).toBeVisible();
    await expect(page.getByText(orgName)).toBeVisible(); // appears in the table below
  });
});
