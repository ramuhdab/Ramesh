import { prisma } from "../../lib/prisma";
import { eventBus } from "../../lib/eventBus";
import { AppError } from "../../middleware/errorHandler";
import * as approvalService from "./approval.service";

/**
 * Procurement & Approvals module - WF7 (Purchase, approval-chain portion),
 * WF17 (Indent), WF18/WF19 (stock alerts create requests - see below),
 * WF20 (Cancellation).
 */

export async function createProcurementRequest(
  organizationId: string,
  input: { sourceType: "low_stock" | "critical_stock" | "indent"; inventoryItemId?: string; quantity: number },
  actorUserId?: string | null
) {
  const request = await prisma.procurementRequest.create({
    data: { organizationId, sourceType: input.sourceType, inventoryItemId: input.inventoryItemId, quantity: input.quantity },
  });

  const levels = await approvalService.startApprovalChain(organizationId, "procurement_request", request.id, "procurement");

  // notifyRoles: levels[0] - the first approver in the chain needs to know a
  // request is waiting on them (see approval.service.ts decide()/
  // checkEscalations() for the equivalent notify-on-advance/escalate logic).
  eventBus.publish({ type: "procurement.requested", organizationId, actorUserId, payload: { id: request.id }, notifyRoles: levels[0] ? [levels[0]] : undefined });

  return request;
}

export async function createIndent(organizationId: string, input: { departmentId?: string; items: unknown }, raisedByUserId: string) {
  const indent = await prisma.indent.create({
    data: { organizationId, departmentId: input.departmentId, raisedBy: raisedByUserId, items: input.items as any },
  });

  const levels = await approvalService.startApprovalChain(organizationId, "indent", indent.id, "indent");

  eventBus.publish({ type: "procurement.indent_raised", organizationId, actorUserId: raisedByUserId, payload: { id: indent.id }, notifyRoles: levels[0] ? [levels[0]] : undefined });

  return indent;
}

async function getProcurementRequest(organizationId: string, id: string) {
  const request = await prisma.procurementRequest.findFirst({ where: { id, organizationId } });
  if (!request) throw new AppError(404, "NOT_FOUND", "Procurement request not found.");
  return request;
}

async function getIndent(organizationId: string, id: string) {
  const indent = await prisma.indent.findFirst({ where: { id, organizationId } });
  if (!indent) throw new AppError(404, "NOT_FOUND", "Indent not found.");
  return indent;
}

/** WF7/WF17: advance the approval chain for a procurement request. */
export async function decideProcurementRequest(
  organizationId: string,
  id: string,
  approverUserId: string,
  approverRoles: string[],
  decision: "approved" | "rejected"
) {
  const request = await getProcurementRequest(organizationId, id);
  if (request.status !== "pending") {
    throw new AppError(400, "INVALID_STATE", `This request is already ${request.status}.`);
  }

  const result = await approvalService.decide(organizationId, "procurement_request", id, "procurement", approverUserId, approverRoles, decision);

  const updated = await prisma.procurementRequest.update({
    where: { id },
    data: {
      currentApprovalLevel: result.nextLevel,
      status: result.done ? (result.finalDecision as string) : "pending",
    },
  });

  if (result.done && result.finalDecision === "approved") {
    await generatePurchaseOrder(organizationId, updated, approverUserId);
  }

  return updated;
}

export async function decideIndent(organizationId: string, id: string, approverUserId: string, approverRoles: string[], decision: "approved" | "rejected") {
  const indent = await getIndent(organizationId, id);
  if (indent.status !== "pending") {
    throw new AppError(400, "INVALID_STATE", `This indent is already ${indent.status}.`);
  }

  const result = await approvalService.decide(organizationId, "indent", id, "indent", approverUserId, approverRoles, decision);

  const updated = await prisma.indent.update({
    where: { id },
    data: {
      currentApprovalLevel: result.nextLevel,
      status: result.done ? (result.finalDecision as string) : "pending",
    },
  });

  // WF17: an approved indent feeds into Procurement.
  if (result.done && result.finalDecision === "approved") {
    eventBus.publish({ type: "procurement.indent_approved", organizationId, actorUserId: approverUserId, payload: { id } });
  }

  return updated;
}

async function generatePurchaseOrder(organizationId: string, request: { id: string; inventoryItemId: string | null }, actorUserId?: string | null) {
  // A vendor must already be "approved" (WF15) to receive a PO; this picks
  // the first approved vendor as a simple default - a full vendor-selection
  // workflow (bidding, preferred vendor per category, etc.) is out of scope
  // for v1 and flagged as a follow-up.
  const vendor = await prisma.vendor.findFirst({ where: { organizationId, status: "approved" } });
  if (!vendor) {
    // Still mark the request approved; PO generation can be retried once a vendor exists.
    eventBus.publish({ type: "procurement.po_generation_blocked", organizationId, actorUserId, payload: { id: request.id, reason: "no_approved_vendor" } });
    return null;
  }

  const po = await prisma.purchaseOrder.create({
    data: {
      organizationId,
      procurementRequestId: request.id,
      vendorId: vendor.id,
      status: "issued",
      poNumber: `PO-${Date.now()}`,
    },
  });

  eventBus.publish({ type: "procurement.po_issued", organizationId, actorUserId, payload: { id: po.id, procurementRequestId: request.id, vendorId: vendor.id } });

  return po;
}

/** WF20 Procurement Cancellation: mandatory reason, only while pending. */
export async function cancelProcurementRequest(organizationId: string, id: string, reason: string, actorUserId?: string | null) {
  const request = await getProcurementRequest(organizationId, id);
  if (request.status !== "pending") {
    throw new AppError(400, "INVALID_STATE", "Only a pending procurement request can be cancelled.");
  }

  const updated = await prisma.procurementRequest.update({ where: { id }, data: { status: "cancelled", cancelledReason: reason } });

  eventBus.publish({ type: "procurement.cancelled", organizationId, actorUserId, payload: { id, reason } });

  return updated;
}

export async function getProcurementStatus(organizationId: string, id: string) {
  const request = await getProcurementRequest(organizationId, id);
  const history = await approvalService.getApprovalHistory(organizationId, "procurement_request", id);
  return { request, approvalHistory: history };
}

export async function listProcurementRequests(organizationId: string) {
  // include inventoryItem so the frontend can show a readable item name
  // instead of a bare id - additive, doesn't change any existing consumer's
  // access pattern (report.registry.ts re-queries independently).
  return prisma.procurementRequest.findMany({ where: { organizationId }, include: { inventoryItem: true }, orderBy: { createdAt: "desc" } });
}

export async function listIndents(organizationId: string) {
  return prisma.indent.findMany({ where: { organizationId }, include: { department: true }, orderBy: { createdAt: "desc" } });
}

/**
 * WF18/WF19: called by a scheduled stock scan (see server.ts) - creates a
 * procurement request automatically for any item under its low/critical
 * threshold that doesn't already have an open request.
 */
export async function autoCreateProcurementForLowStock(organizationId: string, inventoryItemId: string, level: "low" | "critical") {
  const existing = await prisma.procurementRequest.findFirst({
    where: { organizationId, inventoryItemId, status: "pending" },
  });
  if (existing) return existing;

  return createProcurementRequest(organizationId, { sourceType: level === "critical" ? "critical_stock" : "low_stock", inventoryItemId, quantity: 1 }, null);
}
