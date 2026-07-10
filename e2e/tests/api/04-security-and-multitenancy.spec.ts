import { test, expect } from "@playwright/test";
import { authHeaders, loginSuperAdmin, RUN_ID } from "./helpers";
import { loadState, E2EState } from "./state";

/**
 * Security-focused checks that exercise fixes from both independent
 * code-review passes (docs/modules/01-foundation-modules.md and
 * 02-transactional-modules.md): password policy, account lockout,
 * Super-Admin-only route gating, organization-status enforcement at login,
 * and cross-tenant data isolation.
 */
test.describe.serial("Security & Multi-Tenancy", () => {
  let state: E2EState;

  test.beforeAll(() => {
    state = loadState();
  });

  test("Weak passwords are rejected by the password policy (FR-5)", async ({ request }) => {
    const res = await request.post("/auth/change-password", {
      headers: authHeaders(state.orgAdmin.token),
      data: { currentPassword: state.orgAdmin.password, newPassword: "weak" },
    });
    expect(res.status()).toBe(400);
  });

  test("Org Admin cannot access the Super-Admin-only organization list", async ({ request }) => {
    const res = await request.get("/organizations", { headers: authHeaders(state.orgAdmin.token) });
    expect(res.status(), "Org Admin should not be able to list all platform organizations").toBe(403);
  });

  test("Account locks after 5 consecutive failed logins (FR-5)", async ({ request }) => {
    // Uses the HR user created in global.setup.ts - a throwaway-safe target since no other
    // spec in this suite depends on HR's account remaining unlocked after this point.
    const username = state.users.hr.username;
    for (let i = 0; i < 5; i++) {
      await request.post("/auth/login", { data: { username, password: "definitely-wrong-password" } });
    }
    const res = await request.post("/auth/login", { data: { username, password: state.users.hr.password } });
    expect(res.status(), "expected the account to be locked after 5 failed attempts, even with the correct password").toBe(423);
  });

  test("A second organization cannot see the first organization's employees (multi-tenancy)", async ({ request }) => {
    const superAdminToken = await loginSuperAdmin(request);
    const orgName = `E2E Second Org ${RUN_ID}`;
    const adminUsername = `e2e_admin2_${RUN_ID}`;

    const createRes = await request.post("/organizations", {
      headers: authHeaders(superAdminToken),
      data: { name: orgName, adminUsername, adminEmail: `${adminUsername}@example.com` },
    });
    expect(createRes.ok()).toBeTruthy();
    const { organization, activationToken, adminTempPassword } = (await createRes.json()).data;

    await request.post(`/organizations/${organization.id}/activate`, { data: { token: activationToken } });
    const loginRes = await request.post("/auth/login", { data: { username: adminUsername, password: adminTempPassword } });
    const secondOrgToken = (await loginRes.json()).data.accessToken;

    // Second org's admin lists buildings - must NOT see the first org's building created in global.setup.ts.
    const buildingsRes = await request.get("/config/buildings", { headers: authHeaders(secondOrgToken) });
    expect(buildingsRes.ok()).toBeTruthy();
    const buildingIds = (await buildingsRes.json()).data.map((b: { id: string }) => b.id);
    expect(buildingIds).not.toContain(state.masterData.buildingId);
  });

  test("A pending (not-yet-activated) organization's admin cannot log in", async ({ request }) => {
    const superAdminToken = await loginSuperAdmin(request);
    const orgName = `E2E Pending Org ${RUN_ID}`;
    const adminUsername = `e2e_admin3_${RUN_ID}`;

    const createRes = await request.post("/organizations", {
      headers: authHeaders(superAdminToken),
      data: { name: orgName, adminUsername, adminEmail: `${adminUsername}@example.com` },
    });
    expect(createRes.ok()).toBeTruthy();
    const { adminTempPassword } = (await createRes.json()).data;
    // Deliberately do NOT call /activate.

    const loginRes = await request.post("/auth/login", { data: { username: adminUsername, password: adminTempPassword } });
    expect(loginRes.status(), "login must be blocked until the organization is activated (FR-1)").toBe(403);
  });

  test("Duplicate organization names are rejected", async ({ request }) => {
    const superAdminToken = await loginSuperAdmin(request);
    const res = await request.post("/organizations", {
      headers: authHeaders(superAdminToken),
      data: { name: `E2E Test Org ${RUN_ID}`, adminUsername: `dupe_${RUN_ID}`, adminEmail: `dupe_${RUN_ID}@example.com` }, // same name global.setup.ts used
    });
    expect(res.status()).toBe(409);
  });
});
