import { test, expect } from "@playwright/test";
import { authHeaders, RUN_ID } from "./helpers";
import { loadState, E2EState } from "./state";

/** WF15 Vendor Approval, WF16 Vendor Performance. */
test.describe.serial("Vendor Management", () => {
  let state: E2EState;
  let orgAdminHeaders: Record<string, string>;
  let financeHeaders: Record<string, string>;
  let mdHeaders: Record<string, string>;

  let vendorId: string;

  test.beforeAll(() => {
    state = loadState();
    orgAdminHeaders = authHeaders(state.orgAdmin.token);
    financeHeaders = authHeaders(state.users.finance.token);
    mdHeaders = authHeaders(state.users.managingDirector.token);
  });

  test("Org Admin creates a vendor (starts pending)", async ({ request }) => {
    const res = await request.post("/vendors", { headers: orgAdminHeaders, data: { name: `Acme Supplies ${RUN_ID}` } });
    expect(res.ok(), `create vendor failed: ${await res.text()}`).toBeTruthy();
    const body = (await res.json()).data;
    expect(body.status).toBe("pending");
    vendorId = body.id;
  });

  test("Management cannot approve before Finance verification (state machine)", async ({ request }) => {
    const res = await request.post(`/vendors/${vendorId}/approve`, { headers: mdHeaders });
    expect(res.status(), `expected approve-before-verify to be rejected: ${await res.text()}`).toBe(400);
  });

  test("Finance verifies the vendor", async ({ request }) => {
    const res = await request.post(`/vendors/${vendorId}/verify`, { headers: financeHeaders });
    expect(res.ok(), `verify failed: ${await res.text()}`).toBeTruthy();
    expect((await res.json()).data.status).toBe("verified");
  });

  test("Management approves the vendor - now usable in procurement", async ({ request }) => {
    const res = await request.post(`/vendors/${vendorId}/approve`, { headers: mdHeaders });
    expect(res.ok(), `approve failed: ${await res.text()}`).toBeTruthy();
    expect((await res.json()).data.status).toBe("approved");
  });

  test("Rejects out-of-range ratings", async ({ request }) => {
    const res = await request.post(`/vendors/${vendorId}/ratings`, {
      headers: orgAdminHeaders,
      data: { deliveryRating: 6, qualityRating: 5, priceRating: 5 },
    });
    expect(res.status()).toBe(400);
  });

  test("Records a performance rating and computes a rolling score (WF16)", async ({ request }) => {
    const res = await request.post(`/vendors/${vendorId}/ratings`, {
      headers: orgAdminHeaders,
      data: { deliveryRating: 5, qualityRating: 4, priceRating: 4 },
    });
    expect(res.ok(), `rate vendor failed: ${await res.text()}`).toBeTruthy();
    const body = (await res.json()).data;
    // (5+4+4)/3 = 4.333..., *20 = 86.67
    expect(Number(body.performanceScore)).toBeCloseTo(86.67, 1);
  });

  test("A purchase order id that doesn't belong to this vendor/org is rejected on rating", async ({ request }) => {
    const res = await request.post(`/vendors/${vendorId}/ratings`, {
      headers: orgAdminHeaders,
      data: { purchaseOrderId: "00000000-0000-0000-0000-000000000000", deliveryRating: 5, qualityRating: 5, priceRating: 5 },
    });
    expect(res.status(), `expected an invalid/foreign purchaseOrderId to be rejected: ${await res.text()}`).toBe(400);
  });
});
