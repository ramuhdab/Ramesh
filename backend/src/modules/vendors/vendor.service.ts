import { prisma } from "../../lib/prisma";
import { eventBus } from "../../lib/eventBus";
import { AppError } from "../../middleware/errorHandler";

/**
 * Vendor Management module - WF15 (Vendor Approval), WF16 (Vendor Performance).
 */

export async function createVendor(organizationId: string, input: { name: string; documents?: Record<string, unknown> }, actorUserId?: string | null) {
  const vendor = await prisma.vendor.create({
    data: { organizationId, name: input.name, documents: input.documents, status: "pending" },
  });
  eventBus.publish({ type: "vendor.created", organizationId, actorUserId, payload: { id: vendor.id, name: vendor.name } });
  return vendor;
}

export async function listVendors(organizationId: string) {
  return prisma.vendor.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
}

export async function getVendor(organizationId: string, id: string) {
  const vendor = await prisma.vendor.findFirst({ where: { id, organizationId } });
  if (!vendor) throw new AppError(404, "NOT_FOUND", "Vendor not found.");
  return vendor;
}

/** WF15 step: Finance verification (moves pending -> verified). */
export async function verifyVendor(organizationId: string, id: string, actorUserId?: string | null) {
  const vendor = await getVendor(organizationId, id);
  if (vendor.status !== "pending") {
    throw new AppError(400, "INVALID_STATE", `Vendor must be pending to verify (current status: ${vendor.status}).`);
  }
  const updated = await prisma.vendor.update({ where: { id }, data: { status: "verified" } });
  eventBus.publish({ type: "vendor.verified", organizationId, actorUserId, payload: { id } });
  return updated;
}

/** WF15 step: final management approval (moves verified -> approved, usable in procurement). */
export async function approveVendor(organizationId: string, id: string, actorUserId?: string | null) {
  const vendor = await getVendor(organizationId, id);
  if (vendor.status !== "verified") {
    throw new AppError(400, "INVALID_STATE", `Vendor must be Finance-verified before management approval (current status: ${vendor.status}).`);
  }
  const updated = await prisma.vendor.update({ where: { id }, data: { status: "approved" } });
  eventBus.publish({ type: "vendor.approved", organizationId, actorUserId, payload: { id } });
  return updated;
}

/**
 * WF16 Vendor Performance: rate delivery/quality/price (1-5 each) after a
 * completed purchase, then recompute a rolling average score (0-100 scale,
 * mean of the three ratings * 20, averaged across every rating on file).
 */
export async function rateVendor(
  organizationId: string,
  vendorId: string,
  input: { purchaseOrderId?: string; deliveryRating: number; qualityRating: number; priceRating: number },
  actorUserId?: string | null
) {
  await getVendor(organizationId, vendorId);
  for (const [label, value] of Object.entries({ delivery: input.deliveryRating, quality: input.qualityRating, price: input.priceRating })) {
    if (value < 1 || value > 5) throw new AppError(400, "INVALID_RATING", `${label} rating must be between 1 and 5.`);
  }

  if (input.purchaseOrderId) {
    // Multi-tenancy + data integrity: the PO must belong to this org AND this vendor.
    const po = await prisma.purchaseOrder.findFirst({ where: { id: input.purchaseOrderId, organizationId, vendorId } });
    if (!po) throw new AppError(400, "INVALID_PURCHASE_ORDER", "Purchase order does not belong to this vendor/organization.");
  }

  await prisma.vendorRating.create({
    data: {
      organizationId,
      vendorId,
      purchaseOrderId: input.purchaseOrderId,
      deliveryRating: input.deliveryRating,
      qualityRating: input.qualityRating,
      priceRating: input.priceRating,
    },
  });

  const allRatings = await prisma.vendorRating.findMany({ where: { vendorId } });
  const average =
    allRatings.reduce((sum, r) => sum + (r.deliveryRating + r.qualityRating + r.priceRating) / 3, 0) / allRatings.length;
  const score = Math.round(average * 20 * 100) / 100; // 1-5 scale -> 0-100 scale, 2dp

  const updated = await prisma.vendor.update({ where: { id: vendorId }, data: { performanceScore: score } });

  eventBus.publish({ type: "vendor.rated", organizationId, actorUserId, payload: { id: vendorId, performanceScore: score } });

  return updated;
}
