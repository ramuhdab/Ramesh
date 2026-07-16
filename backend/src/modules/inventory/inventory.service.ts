import { prisma } from "../../lib/prisma";
import { eventBus } from "../../lib/eventBus";
import { AppError } from "../../middleware/errorHandler";

/**
 * Inventory Core module - WF7 (Purchase, partial - the procurement chain
 * itself lives in the Procurement module), WF8 (Goods Receipt), WF9 (Issue),
 * WF10 (Return), WF11 (Replacement), WF14 (Adjustment), WF18/WF19 (stock alerts).
 *
 * Deviation flagged: the data model doc sketched a generic
 * `inventory_transactions` ledger table; it was not added to the Prisma
 * schema. Instead, the specific per-workflow tables (ItemIssuance,
 * ItemReturn, RecoveryCalculation) plus the AuditLog (which every mutation
 * here publishes to via the event bus) together serve as the full
 * transaction history, per the "keep it as simple as possible" requirement.
 * If a single unified ledger view turns out to be needed for reporting,
 * add it as a read-model/view over these tables rather than a write path.
 */

const DEFAULT_LOW_STOCK_QTY = 20; // WF18
const DEFAULT_CRITICAL_STOCK_QTY = 5; // WF19

export async function createItem(organizationId: string, input: { itemCode: string; name: string; inventoryCategoryId?: string; unitCost?: number }) {
  const existing = await prisma.inventoryItem.findFirst({ where: { organizationId, itemCode: input.itemCode } });
  if (existing) throw new AppError(409, "ITEM_CODE_TAKEN", "Item Code must be unique.");
  if (input.inventoryCategoryId) {
    // Multi-tenancy: a client-supplied category id must belong to this org, not just exist somewhere.
    const category = await prisma.inventoryCategory.findFirst({ where: { id: input.inventoryCategoryId, organizationId } });
    if (!category) throw new AppError(400, "INVALID_INVENTORY_CATEGORY", "Inventory category does not belong to this organization.");
  }
  return prisma.inventoryItem.create({ data: { organizationId, ...input } });
}

export async function listItems(organizationId: string) {
  return prisma.inventoryItem.findMany({ where: { organizationId }, include: { inventoryCategory: true }, orderBy: { itemCode: "asc" } });
}

export async function getItem(organizationId: string, id: string) {
  const item = await prisma.inventoryItem.findFirst({ where: { id, organizationId } });
  if (!item) throw new AppError(404, "NOT_FOUND", "Inventory item not found.");
  return item;
}

/** WF8 Goods Receipt: Store Keeper inspects quantity/quality on delivery. */
export async function goodsReceipt(
  organizationId: string,
  input: { inventoryItemId: string; quantity: number; decision: "accept" | "reject" },
  actorUserId?: string | null
) {
  const item = await getItem(organizationId, input.inventoryItemId);

  if (input.decision === "reject") {
    eventBus.publish({ type: "inventory.goods_rejected", organizationId, actorUserId, payload: { id: item.id, quantity: input.quantity } });
    return { item, accepted: false };
  }

  const updated = await prisma.inventoryItem.update({
    where: { id: item.id },
    data: { currentStockQty: { increment: input.quantity } },
  });
  eventBus.publish({ type: "inventory.goods_received", organizationId, actorUserId, payload: { id: item.id, quantity: input.quantity } });
  return { item: updated, accepted: true };
}

/**
 * WF9 Inventory Issue: validates the employee's annual allocation for the
 * item's category (FR-13 / BRD business rule "cannot issue beyond annual
 * allocation") before decrementing stock and recording the issuance.
 */
export async function issueItem(
  organizationId: string,
  input: { employeeId: string; inventoryItemId: string; quantity: number; signatureRef?: string },
  issuedByUserId: string
) {
  const [employee, item] = await Promise.all([
    prisma.employee.findFirst({ where: { id: input.employeeId, organizationId } }),
    getItem(organizationId, input.inventoryItemId),
  ]);
  if (!employee) throw new AppError(404, "NOT_FOUND", "Employee not found.");
  if (employee.status !== "active" && employee.status !== "transferred") {
    throw new AppError(400, "EMPLOYEE_NOT_ELIGIBLE", "Employee is not eligible for inventory issuance (must be active).");
  }
  if (item.currentStockQty < input.quantity) {
    throw new AppError(409, "INSUFFICIENT_STOCK", `Only ${item.currentStockQty} unit(s) in stock.`);
  }

  let policyId: string | null = null;
  if (item.inventoryCategoryId) {
    const policy = await prisma.itemPolicy.findFirst({ where: { organizationId, inventoryCategoryId: item.inventoryCategoryId, isActive: true } });
    if (policy) {
      policyId = policy.id;
      const yearStart = new Date(new Date().getFullYear(), 0, 1);
      // The policy (and its annualAllocation) is per CATEGORY, not per item -
      // so the cap must be checked across every item in that category the
      // employee has received this year, not just this one item code.
      // (Bug fixed: this previously only summed the single inventoryItemId,
      // letting an employee exhaust the category cap by requesting
      // different item codes within the same category.)
      const issuedThisYear = await prisma.itemIssuance.aggregate({
        where: {
          employeeId: input.employeeId,
          issuedAt: { gte: yearStart },
          inventoryItem: { inventoryCategoryId: item.inventoryCategoryId },
        },
        _sum: { quantity: true },
      });
      const alreadyIssued = issuedThisYear._sum.quantity ?? 0;
      if (alreadyIssued + input.quantity > policy.annualAllocation) {
        throw new AppError(
          409,
          "ANNUAL_ALLOCATION_EXCEEDED",
          `This would exceed the annual allocation of ${policy.annualAllocation} for this item's category (already issued ${alreadyIssued} this year).`
        );
      }
    }
  }

  const [issuance] = await prisma.$transaction([
    prisma.itemIssuance.create({
      data: {
        organizationId,
        employeeId: input.employeeId,
        inventoryItemId: input.inventoryItemId,
        quantity: input.quantity,
        issuedBy: issuedByUserId,
        signatureRef: input.signatureRef,
        policyId,
      },
    }),
    prisma.inventoryItem.update({ where: { id: input.inventoryItemId }, data: { currentStockQty: { decrement: input.quantity } } }),
  ]);

  eventBus.publish({
    type: "inventory.issued",
    organizationId,
    actorUserId: issuedByUserId,
    payload: { id: issuance.id, employeeId: input.employeeId, inventoryItemId: input.inventoryItemId, quantity: input.quantity },
  });

  return issuance;
}

/**
 * WF10 Inventory Return: good condition -> restock; damaged -> scrap, and a
 * LostDamagedReport(type: "damaged") is opened so the Recovery module can
 * process it (per WF10's "Damaged -> Scrap -> Recovery" branch).
 */
export async function returnItem(
  organizationId: string,
  input: { itemIssuanceId: string; quantity: number; condition: "good" | "damaged" },
  inspectedByUserId: string
) {
  const issuance = await prisma.itemIssuance.findFirst({ where: { id: input.itemIssuanceId, organizationId }, include: { inventoryItem: true } });
  if (!issuance) throw new AppError(404, "NOT_FOUND", "Item issuance not found.");

  const disposition = input.condition === "good" ? "restock" : "scrap";

  const [itemReturn] = await prisma.$transaction([
    prisma.itemReturn.create({
      data: {
        organizationId,
        itemIssuanceId: input.itemIssuanceId,
        quantity: input.quantity,
        condition: input.condition,
        inspectedBy: inspectedByUserId,
        disposition,
      },
    }),
    ...(input.condition === "good"
      ? [prisma.inventoryItem.update({ where: { id: issuance.inventoryItemId }, data: { currentStockQty: { increment: input.quantity } } })]
      : []),
  ]);

  if (input.condition === "damaged") {
    await prisma.lostDamagedReport.create({
      data: {
        organizationId,
        employeeId: issuance.employeeId,
        inventoryItemId: issuance.inventoryItemId,
        itemIssuanceId: issuance.id,
        type: "damaged",
        reportedAt: new Date(),
      },
    });
  }

  eventBus.publish({
    type: "inventory.returned",
    organizationId,
    actorUserId: inspectedByUserId,
    payload: { id: itemReturn.id, itemIssuanceId: input.itemIssuanceId, condition: input.condition, disposition },
  });

  return itemReturn;
}

/**
 * WF11 Inventory Replacement: gated at the route level by a manager-approval
 * permission (INVENTORY_ADJUST, shared with WF14 - both are "requires
 * manager approval" actions). Issues a new item; does not require the
 * original to already be returned (the old item may itself be the reason
 * for replacement, e.g. wear-and-tear).
 */
export async function replaceItem(
  organizationId: string,
  input: { employeeId: string; oldItemIssuanceId?: string; newInventoryItemId: string; quantity: number; reason: string },
  approverUserId: string
) {
  const newIssuance = await issueItem(
    organizationId,
    { employeeId: input.employeeId, inventoryItemId: input.newInventoryItemId, quantity: input.quantity },
    approverUserId
  );

  await prisma.employeeHistoryEvent.create({
    data: {
      employeeId: input.employeeId,
      eventType: "item_replaced",
      details: { oldItemIssuanceId: input.oldItemIssuanceId, newIssuanceId: newIssuance.id, reason: input.reason },
    },
  });

  eventBus.publish({ type: "inventory.replaced", organizationId, actorUserId: approverUserId, payload: { id: newIssuance.id } });

  return newIssuance;
}

/** WF14 Inventory Adjustment: physical-count correction, manager-approved. */
export async function adjustStock(organizationId: string, input: { inventoryItemId: string; newQuantity: number; reason: string }, approverUserId: string) {
  const item = await getItem(organizationId, input.inventoryItemId);
  const updated = await prisma.inventoryItem.update({ where: { id: item.id }, data: { currentStockQty: input.newQuantity } });

  eventBus.publish({
    type: "inventory.adjusted",
    organizationId,
    actorUserId: approverUserId,
    payload: { id: item.id, before: item.currentStockQty, after: input.newQuantity, reason: input.reason },
  });

  return updated;
}

/**
 * List issuances (who has what), optionally scoped to one employee. Backs
 * the frontend's Issue/Return screens - there is no way to process a return
 * or see what's currently issued without knowing which ItemIssuance to
 * reference, and this is also the closest thing to the BRD's core
 * "employee-to-inventory mapping" view (FR-8: track individual employee
 * parameters - items given, quantities, dates).
 */
export async function listIssuances(organizationId: string, employeeId?: string) {
  return prisma.itemIssuance.findMany({
    where: { organizationId, ...(employeeId ? { employeeId } : {}) },
    include: { employee: true, inventoryItem: true, returns: true },
    orderBy: { issuedAt: "desc" },
  });
}

/** WF18/WF19: low-stock (yellow, <20 by default) / critical-stock (red, <5 by default) alerts. */
export async function getStockAlerts(organizationId: string) {
  const items = await prisma.inventoryItem.findMany({
    where: { organizationId, isActive: true },
    include: { stockThresholds: true },
  });

  return items
    .map((item) => {
      const threshold = item.stockThresholds[0];
      const lowStockQty = threshold?.lowStockQty ?? DEFAULT_LOW_STOCK_QTY;
      const criticalStockQty = threshold?.criticalStockQty ?? DEFAULT_CRITICAL_STOCK_QTY;
      let level: "critical" | "low" | null = null;
      if (item.currentStockQty < criticalStockQty) level = "critical";
      else if (item.currentStockQty < lowStockQty) level = "low";
      return level ? { itemId: item.id, itemCode: item.itemCode, name: item.name, currentStockQty: item.currentStockQty, level } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}
