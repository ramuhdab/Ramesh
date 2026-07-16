import { test, expect } from "@playwright/test";
import { authHeaders, RUN_ID } from "./helpers";
import { loadState, E2EState } from "./state";

/**
 * The core employee <-> inventory <-> recovery journey, exercised as one
 * serial flow since each step's output feeds the next (this is exactly the
 * flow the independent code-review agents traced by hand in docs/modules/
 * 02-transactional-modules.md - this suite actually runs it instead).
 *
 * Covers: WF3 (Employee Creation), WF9 (Issue), WF10 (Return),
 * WF12 (Lost Item), WF26 (Recovery Calculation), WF5 (Employee Exit).
 *
 * IMPORTANT: `loadState()` is called inside `test.beforeAll`, not at the
 * top of `describe` - Playwright collects/parses every spec file up front
 * (across all projects) before any project starts running, so calling it
 * at describe-body scope would run before the "setup" project's dependency
 * has actually executed and written the state file.
 */
test.describe.serial("Employee -> Inventory -> Recovery -> Exit", () => {
  let state: E2EState;
  let orgAdminHeaders: Record<string, string>;
  let storeKeeperHeaders: Record<string, string>;
  let financeHeaders: Record<string, string>;
  let hrHeaders: Record<string, string>;

  let employeeId: string;
  let inventoryItemId: string;
  let issuanceId: string;
  let lostReportId: string;
  let recoveryId: string;

  test.beforeAll(() => {
    state = loadState();
    orgAdminHeaders = authHeaders(state.orgAdmin.token);
    storeKeeperHeaders = authHeaders(state.users.storeKeeper.token);
    financeHeaders = authHeaders(state.users.finance.token);
    hrHeaders = authHeaders(state.users.hr.token);
  });

  test("HR creates an employee (WF3) with mandatory building/position", async ({ request }) => {
    const res = await request.post("/employees", {
      headers: hrHeaders,
      data: {
        employeeCode: `EMP-${RUN_ID}`,
        name: "Alex Employee",
        joiningDate: "2024-01-15",
        buildingId: state.masterData.buildingId,
        positionId: state.masterData.positionId,
        departmentId: state.masterData.departmentId,
        employeeCategoryId: state.masterData.employeeCategoryId,
      },
    });
    expect(res.ok(), `create employee failed: ${await res.text()}`).toBeTruthy();
    const body = await res.json();
    expect(body.data.status).toBe("active");
    employeeId = body.data.id;
  });

  test("Duplicate employee code is rejected (FR-7 uniqueness rule)", async ({ request }) => {
    const res = await request.post("/employees", {
      headers: hrHeaders,
      data: {
        employeeCode: `EMP-${RUN_ID}`, // same code as above
        name: "Duplicate Employee",
        joiningDate: "2024-01-15",
        buildingId: state.masterData.buildingId,
        positionId: state.masterData.positionId,
      },
    });
    expect(res.status()).toBe(409);
  });

  test("Org Admin creates an inventory item in the policy-governed category", async ({ request }) => {
    const res = await request.post("/inventory/items", {
      headers: orgAdminHeaders,
      data: { itemCode: `ITEM-${RUN_ID}`, name: "Safety Helmet", inventoryCategoryId: state.masterData.inventoryCategoryId, unitCost: 45 },
    });
    expect(res.ok(), `create item failed: ${await res.text()}`).toBeTruthy();
    inventoryItemId = (await res.json()).data.id;
  });

  test("Goods receipt (WF8) brings stock in", async ({ request }) => {
    const res = await request.post("/inventory/goods-receipt", {
      headers: storeKeeperHeaders,
      data: { inventoryItemId, quantity: 10, decision: "accept" },
    });
    expect(res.ok(), `goods receipt failed: ${await res.text()}`).toBeTruthy();
    expect((await res.json()).data.item.currentStockQty).toBe(10);
  });

  test("Store Keeper issues the item to the employee (WF9), stock decrements", async ({ request }) => {
    const res = await request.post("/inventory/issue", {
      headers: storeKeeperHeaders,
      data: { employeeId, inventoryItemId, quantity: 1 },
    });
    expect(res.ok(), `issue failed: ${await res.text()}`).toBeTruthy();
    issuanceId = (await res.json()).data.id;

    const itemRes = await request.get(`/inventory/items/${inventoryItemId}`, { headers: storeKeeperHeaders });
    expect((await itemRes.json()).data.currentStockQty).toBe(9);
  });

  test("Issuing beyond the category's annual allocation is rejected", async ({ request }) => {
    // The item policy set in global.setup.ts caps this category at 2/year; one is already issued.
    // Issuing 2 more (total 3) must be blocked - and per the fixed bug, this must be enforced
    // across the whole CATEGORY, not just this one item code.
    const secondItemRes = await request.post("/inventory/items", {
      headers: orgAdminHeaders,
      data: { itemCode: `ITEM-${RUN_ID}-B`, name: "Safety Gloves", inventoryCategoryId: state.masterData.inventoryCategoryId, unitCost: 10 },
    });
    expect(secondItemRes.ok()).toBeTruthy();
    const secondItemId = (await secondItemRes.json()).data.id;
    await request.post("/inventory/goods-receipt", { headers: storeKeeperHeaders, data: { inventoryItemId: secondItemId, quantity: 10, decision: "accept" } });

    const res = await request.post("/inventory/issue", {
      headers: storeKeeperHeaders,
      data: { employeeId, inventoryItemId: secondItemId, quantity: 2 }, // 1 (already issued, different item, same category) + 2 = 3 > cap of 2
    });
    expect(res.status(), `expected the category-wide annual allocation to block this, got: ${await res.text()}`).toBe(409);
  });

  test("Employee reports the original item lost (WF12)", async ({ request }) => {
    const res = await request.post("/inventory/lost", {
      headers: storeKeeperHeaders,
      data: { employeeId, inventoryItemId, itemIssuanceId: issuanceId },
    });
    expect(res.ok(), `report lost failed: ${await res.text()}`).toBeTruthy();
    lostReportId = (await res.json()).data.id;
  });

  test("Recovery calculation is blocked until the incident is manager-verified", async ({ request }) => {
    const res = await request.post("/recovery/calculate", {
      headers: financeHeaders,
      data: { employeeId, sourceType: "loss", itemIssuanceId: issuanceId, lostDamagedReportId: lostReportId },
    });
    expect(res.status(), `expected calculation to be blocked pre-verification: ${await res.text()}`).toBe(409);
  });

  test("Manager verifies the incident, then recovery can be calculated (WF26)", async ({ request }) => {
    const verifyRes = await request.post(`/inventory/incidents/${lostReportId}/verify`, { headers: hrHeaders });
    expect(verifyRes.ok(), `verify incident failed: ${await verifyRes.text()}`).toBeTruthy();

    const calcRes = await request.post("/recovery/calculate", {
      headers: financeHeaders,
      data: { employeeId, sourceType: "loss", itemIssuanceId: issuanceId, lostDamagedReportId: lostReportId },
    });
    expect(calcRes.ok(), `calculate recovery failed: ${await calcRes.text()}`).toBeTruthy();
    const body = (await calcRes.json()).data;
    recoveryId = body.id;
    expect(Number(body.calculatedAmount)).toBeGreaterThan(0);
  });

  test("Employee exit is blocked while recovery is unverified (FR-9)", async ({ request }) => {
    const initiateRes = await request.post(`/employees/${employeeId}/exit/initiate`, { headers: hrHeaders, data: { leavingDate: "2025-06-01" } });
    expect(initiateRes.ok(), `initiate exit failed: ${await initiateRes.text()}`).toBeTruthy();

    const completeRes = await request.post(`/employees/${employeeId}/exit/complete`, { headers: hrHeaders });
    expect(completeRes.status(), `expected exit to be blocked: ${await completeRes.text()}`).toBe(409);
  });

  test("Finance verifies the recovery, then exit completes (WF5 + WF26)", async ({ request }) => {
    const verifyRes = await request.post(`/recovery/${recoveryId}/finance-verify`, { headers: financeHeaders, data: { salaryDeductionRef: `PAYROLL-${RUN_ID}` } });
    expect(verifyRes.ok(), `finance-verify failed: ${await verifyRes.text()}`).toBeTruthy();

    const completeRes = await request.post(`/employees/${employeeId}/exit/complete`, { headers: hrHeaders });
    expect(completeRes.ok(), `complete exit failed: ${await completeRes.text()}`).toBeTruthy();
    expect((await completeRes.json()).data.status).toBe("exited");
  });

  test("Exited employee can be rehired (WF6)", async ({ request }) => {
    const res = await request.post(`/employees/${employeeId}/rehire`, { headers: hrHeaders, data: { joiningDate: "2026-01-01" } });
    expect(res.ok(), `rehire failed: ${await res.text()}`).toBeTruthy();
    expect((await res.json()).data.status).toBe("active");
  });

  test("Stock alerts (WF18/19) reflect current stock relative to thresholds", async ({ request }) => {
    const res = await request.get("/inventory/alerts", { headers: storeKeeperHeaders });
    expect(res.ok()).toBeTruthy();
    // Just confirm the shape - actual alert presence depends on the default 20/5 thresholds vs the small quantities this suite creates.
    expect(Array.isArray((await res.json()).data)).toBe(true);
  });
});
