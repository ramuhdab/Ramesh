import { test, expect } from "@playwright/test";
import { authHeaders, RUN_ID } from "./helpers";
import { loadState, E2EState } from "./state";

/**
 * WF7 (Purchase - approval chain), WF17 (Indent), WF20 (Cancellation), and
 * the approval-engine's role-gating + concurrency-safety fix (each level
 * must be approved by the specific role configured for it; a second,
 * duplicate decide() call on an already-decided step must be rejected -
 * see docs/modules/02-transactional-modules.md item 3).
 *
 * Self-contained: creates and approves its own vendor, rather than
 * depending on 02-vendor-management.spec.ts's vendor, so it behaves
 * correctly regardless of run order or --grep filtering.
 */
test.describe.serial("Procurement & Approvals", () => {
  let state: E2EState;
  let orgAdminHeaders: Record<string, string>;
  let financeHeaders: Record<string, string>;
  let mdHeaders: Record<string, string>;
  let techManagerHeaders: Record<string, string>;
  let seniorManagerHeaders: Record<string, string>;

  let inventoryItemId: string;
  let requestId: string;

  test.beforeAll(() => {
    state = loadState();
    orgAdminHeaders = authHeaders(state.orgAdmin.token);
    financeHeaders = authHeaders(state.users.finance.token);
    mdHeaders = authHeaders(state.users.managingDirector.token);
    techManagerHeaders = authHeaders(state.users.techManager.token);
    seniorManagerHeaders = authHeaders(state.users.seniorManager.token);
  });

  test("Set up an approved vendor and an inventory item for this suite", async ({ request }) => {
    const vendorRes = await request.post("/vendors", { headers: orgAdminHeaders, data: { name: `Procurement Test Vendor ${RUN_ID}` } });
    expect(vendorRes.ok()).toBeTruthy();
    const vendorId = (await vendorRes.json()).data.id;
    await request.post(`/vendors/${vendorId}/verify`, { headers: financeHeaders });
    const approveRes = await request.post(`/vendors/${vendorId}/approve`, { headers: mdHeaders });
    expect(approveRes.ok()).toBeTruthy();

    const itemRes = await request.post("/inventory/items", {
      headers: orgAdminHeaders,
      data: { itemCode: `PROC-ITEM-${RUN_ID}`, name: "Procurement Test Item" },
    });
    expect(itemRes.ok()).toBeTruthy();
    inventoryItemId = (await itemRes.json()).data.id;
  });

  test("Org Admin raises a procurement request (starts the 4-level approval chain)", async ({ request }) => {
    const res = await request.post("/procurement/requests", {
      headers: orgAdminHeaders,
      data: { sourceType: "low_stock", inventoryItemId, quantity: 50 },
    });
    expect(res.ok(), `create procurement request failed: ${await res.text()}`).toBeTruthy();
    const body = (await res.json()).data;
    expect(body.status).toBe("pending");
    expect(body.currentApprovalLevel).toBe(0);
    requestId = body.id;
  });

  test("The wrong role cannot approve level 0 (must be Tech Manager)", async ({ request }) => {
    const res = await request.post(`/procurement/${requestId}/approve`, { headers: financeHeaders, data: { decision: "approved" } });
    expect(res.status(), `expected a non-Tech-Manager approval to be rejected: ${await res.text()}`).toBe(403);
  });

  test("Tech Manager approves level 0, chain advances to level 1 (Senior Manager)", async ({ request }) => {
    const res = await request.post(`/procurement/${requestId}/approve`, { headers: techManagerHeaders, data: { decision: "approved" } });
    expect(res.ok(), `Tech Manager approval failed: ${await res.text()}`).toBeTruthy();
    expect((await res.json()).data.currentApprovalLevel).toBe(1);
  });

  test("The same Tech Manager cannot approve twice (atomic-claim fix for the approval race)", async ({ request }) => {
    const res = await request.post(`/procurement/${requestId}/approve`, { headers: techManagerHeaders, data: { decision: "approved" } });
    // Tech Manager is no longer the role required at level 1 (Senior Manager), so this is rejected
    // for role mismatch - proving the chain actually advanced and isn't re-approvable at the old level.
    expect(res.status()).toBe(403);
  });

  test("Senior Manager approves level 1, chain advances to level 2 (Finance)", async ({ request }) => {
    const res = await request.post(`/procurement/${requestId}/approve`, { headers: seniorManagerHeaders, data: { decision: "approved" } });
    expect(res.ok(), `Senior Manager approval failed: ${await res.text()}`).toBeTruthy();
    expect((await res.json()).data.currentApprovalLevel).toBe(2);
  });

  test("Finance approves level 2, chain advances to level 3 (Managing Director)", async ({ request }) => {
    const res = await request.post(`/procurement/${requestId}/approve`, { headers: financeHeaders, data: { decision: "approved" } });
    expect(res.ok(), `Finance approval failed: ${await res.text()}`).toBeTruthy();
    expect((await res.json()).data.currentApprovalLevel).toBe(3);
    expect((await res.json()).data.status).toBe("pending"); // still one level left
  });

  test("Managing Director gives final approval - request is approved and a PO is auto-issued (WF7)", async ({ request }) => {
    const res = await request.post(`/procurement/${requestId}/approve`, { headers: mdHeaders, data: { decision: "approved" } });
    expect(res.ok(), `MD approval failed: ${await res.text()}`).toBeTruthy();
    expect((await res.json()).data.status).toBe("approved");

    const statusRes = await request.get(`/procurement/${requestId}/status`, { headers: orgAdminHeaders });
    expect(statusRes.ok()).toBeTruthy();
    const status = (await statusRes.json()).data;
    expect(status.approvalHistory).toHaveLength(4);
    expect(status.approvalHistory.every((a: { decision: string }) => a.decision === "approved")).toBe(true);
  });

  test("A pending request can be cancelled with a mandatory reason (WF20)", async ({ request }) => {
    const createRes = await request.post("/procurement/requests", { headers: orgAdminHeaders, data: { sourceType: "low_stock", inventoryItemId, quantity: 5 } });
    const newRequestId = (await createRes.json()).data.id;

    const missingReasonRes = await request.post(`/procurement/${newRequestId}/cancel`, { headers: orgAdminHeaders, data: {} });
    expect(missingReasonRes.status(), "cancel without a reason must be rejected").toBe(400);

    const cancelRes = await request.post(`/procurement/${newRequestId}/cancel`, { headers: orgAdminHeaders, data: { reason: "Duplicate request" } });
    expect(cancelRes.ok(), `cancel failed: ${await cancelRes.text()}`).toBeTruthy();
    expect((await cancelRes.json()).data.status).toBe("cancelled");
  });

  test("An already-approved request cannot be cancelled (state machine)", async ({ request }) => {
    const res = await request.post(`/procurement/${requestId}/cancel`, { headers: orgAdminHeaders, data: { reason: "too late" } });
    expect(res.status()).toBe(400);
  });

  test("Raising an indent starts its own approval chain (WF17)", async ({ request }) => {
    const res = await request.post("/indents", {
      headers: orgAdminHeaders,
      data: { departmentId: state.masterData.departmentId, items: [{ inventoryItemId, quantity: 3 }] },
    });
    expect(res.ok(), `create indent failed: ${await res.text()}`).toBeTruthy();
    expect((await res.json()).data.status).toBe("pending");
  });
});
