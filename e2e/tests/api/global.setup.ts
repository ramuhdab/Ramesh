import { test as setup, expect } from "@playwright/test";
import { RUN_ID, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_USERNAME, authHeaders, loginSuperAdmin } from "./helpers";
import { saveState, E2EState } from "./state";

const TEST_PASSWORD = "TestPass1!"; // satisfies the password policy (8+, upper, lower, number, special)

setup("provision organization, roles, and master data", async ({ request }) => {
  const superAdminToken = await loginSuperAdmin(request);

  // --- WF1 Organization Onboarding ---
  const orgName = `E2E Test Org ${RUN_ID}`;
  const adminUsername = `e2e_admin_${RUN_ID}`;
  const adminEmail = `e2e_admin_${RUN_ID}@example.com`;

  const createOrgRes = await request.post("/organizations", {
    headers: authHeaders(superAdminToken),
    data: { name: orgName, adminUsername, adminEmail },
  });
  expect(createOrgRes.ok(), `create organization failed: ${await createOrgRes.text()}`).toBeTruthy();
  const createOrgBody = await createOrgRes.json();
  const { organization, activationToken, adminTempPassword } = createOrgBody.data;
  expect(activationToken, "activationToken was not returned - is NODE_ENV=production? The dev-echo path is disabled in production.").toBeTruthy();

  const activateRes = await request.post(`/organizations/${organization.id}/activate`, { data: { token: activationToken } });
  expect(activateRes.ok(), `activation failed: ${await activateRes.text()}`).toBeTruthy();

  // First login (temp password) -> forced change-password -> real login.
  const firstLoginRes = await request.post("/auth/login", { data: { username: adminUsername, password: adminTempPassword } });
  expect(firstLoginRes.ok(), `org admin first login failed: ${await firstLoginRes.text()}`).toBeTruthy();
  const firstLoginBody = await firstLoginRes.json();
  expect(firstLoginBody.data.mustChangePassword).toBe(true);

  const changePwRes = await request.post("/auth/change-password", {
    headers: authHeaders(firstLoginBody.data.accessToken),
    data: { currentPassword: adminTempPassword, newPassword: TEST_PASSWORD },
  });
  expect(changePwRes.ok(), `org admin change-password failed: ${await changePwRes.text()}`).toBeTruthy();

  const orgAdminLoginRes = await request.post("/auth/login", { data: { username: adminUsername, password: TEST_PASSWORD } });
  expect(orgAdminLoginRes.ok()).toBeTruthy();
  const orgAdminToken = (await orgAdminLoginRes.json()).data.accessToken as string;
  const orgAdminHeaders = authHeaders(orgAdminToken);

  // --- WF31 Roles: fetch the org's system-defined roles (seeded automatically per FR-1) ---
  const rolesRes = await request.get("/roles", { headers: orgAdminHeaders });
  expect(rolesRes.ok(), `list roles failed: ${await rolesRes.text()}`).toBeTruthy();
  const roles = (await rolesRes.json()).data as { id: string; name: string }[];
  const roleIdByName = (name: string) => {
    const role = roles.find((r) => r.name === name);
    if (!role) throw new Error(`Expected seeded system role "${name}" not found - got: ${roles.map((r) => r.name).join(", ")}`);
    return role.id;
  };

  // --- WF2 create one user per role needed for the rest of the suite ---
  async function provisionUser(label: string, roleName: string) {
    const username = `e2e_${label}_${RUN_ID}`;
    const email = `${username}@example.com`;
    const createRes = await request.post("/users", {
      headers: orgAdminHeaders,
      data: { username, email, roleIds: [roleIdByName(roleName)] },
    });
    expect(createRes.ok(), `create user ${label} failed: ${await createRes.text()}`).toBeTruthy();
    const created = (await createRes.json()).data;

    const login1 = await request.post("/auth/login", { data: { username, password: created.tempPassword } });
    expect(login1.ok(), `first login for ${label} failed: ${await login1.text()}`).toBeTruthy();
    const login1Body = await login1.json();

    const changePw = await request.post("/auth/change-password", {
      headers: authHeaders(login1Body.data.accessToken),
      data: { currentPassword: created.tempPassword, newPassword: TEST_PASSWORD },
    });
    expect(changePw.ok(), `change-password for ${label} failed: ${await changePw.text()}`).toBeTruthy();

    const login2 = await request.post("/auth/login", { data: { username, password: TEST_PASSWORD } });
    expect(login2.ok()).toBeTruthy();
    const token = (await login2.json()).data.accessToken as string;

    return { username, password: TEST_PASSWORD, token, userId: created.id as string };
  }

  const users: E2EState["users"] = {
    hr: await provisionUser("hr", "HR"),
    storeKeeper: await provisionUser("storekeeper", "Store Keeper"),
    techManager: await provisionUser("techmgr", "Tech Manager"),
    seniorManager: await provisionUser("seniormgr", "Senior Manager"),
    finance: await provisionUser("finance", "Finance"),
    managingDirector: await provisionUser("md", "Managing Director"),
  };

  // --- WF35 Master data needed by the rest of the suite ---
  const buildingRes = await request.post("/config/buildings", {
    headers: orgAdminHeaders,
    data: { name: "HQ Tower", code: `HQ-${RUN_ID}` },
  });
  expect(buildingRes.ok(), `create building failed: ${await buildingRes.text()}`).toBeTruthy();
  const buildingId = (await buildingRes.json()).data.id as string;

  const departmentRes = await request.post("/config/departments", {
    headers: orgAdminHeaders,
    data: { name: `Housekeeping ${RUN_ID}` },
  });
  expect(departmentRes.ok(), `create department failed: ${await departmentRes.text()}`).toBeTruthy();
  const departmentId = (await departmentRes.json()).data.id as string;

  const positionRes = await request.post("/config/positions", {
    headers: orgAdminHeaders,
    data: { name: `Technician ${RUN_ID}` },
  });
  expect(positionRes.ok(), `create position failed: ${await positionRes.text()}`).toBeTruthy();
  const positionId = (await positionRes.json()).data.id as string;

  const employeeCategoryRes = await request.post("/config/employee-categories", {
    headers: orgAdminHeaders,
    data: { name: `Housekeeping ${RUN_ID}` },
  });
  expect(employeeCategoryRes.ok(), `create employee category failed: ${await employeeCategoryRes.text()}`).toBeTruthy();
  const employeeCategoryId = (await employeeCategoryRes.json()).data.id as string;

  const inventoryCategoryRes = await request.post("/config/inventory-categories", {
    headers: orgAdminHeaders,
    data: { name: `PPE ${RUN_ID}` },
  });
  expect(inventoryCategoryRes.ok(), `create inventory category failed: ${await inventoryCategoryRes.text()}`).toBeTruthy();
  const inventoryCategoryId = (await inventoryCategoryRes.json()).data.id as string;

  const itemPolicyRes = await request.post("/config/item-policies", {
    headers: orgAdminHeaders,
    data: { inventoryCategoryId, annualAllocation: 2, usefulLifeMonths: 12, recoverableValue: 1200 },
  });
  expect(itemPolicyRes.ok(), `create item policy failed: ${await itemPolicyRes.text()}`).toBeTruthy();
  const itemPolicyId = (await itemPolicyRes.json()).data.id as string;

  saveState({
    organizationId: organization.id,
    orgAdmin: { username: adminUsername, password: TEST_PASSWORD, token: orgAdminToken },
    users,
    masterData: { buildingId, departmentId, positionId, employeeCategoryId, inventoryCategoryId, itemPolicyId },
  });
});
