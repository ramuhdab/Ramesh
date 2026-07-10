import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../utils/asyncHandler";
import { PERMISSIONS } from "../../utils/permissions";
import { AppError } from "../../middleware/errorHandler";
import * as vendorService from "./vendor.service";

export const vendorRouter = Router();
vendorRouter.use(authenticate);

function requireOrg(req: any): string {
  const orgId = req.user?.organizationId;
  if (!orgId) throw new AppError(400, "NO_ORGANIZATION_CONTEXT", "This action requires an organization context.");
  return orgId;
}

vendorRouter.post(
  "/",
  requirePermission(PERMISSIONS.VENDOR_CREATE),
  asyncHandler(async (req, res) => {
    const { name, documents } = z.object({ name: z.string().min(1), documents: z.record(z.unknown()).optional() }).parse(req.body);
    const vendor = await vendorService.createVendor(requireOrg(req), { name, documents }, req.user!.sub);
    res.status(201).json({ data: vendor });
  })
);

vendorRouter.get(
  "/",
  requirePermission(PERMISSIONS.VENDOR_VIEW),
  asyncHandler(async (req, res) => {
    const vendors = await vendorService.listVendors(requireOrg(req));
    res.json({ data: vendors, meta: { count: vendors.length } });
  })
);

vendorRouter.get(
  "/:id",
  requirePermission(PERMISSIONS.VENDOR_VIEW),
  asyncHandler(async (req, res) => {
    const vendor = await vendorService.getVendor(requireOrg(req), req.params.id);
    res.json({ data: vendor });
  })
);

// WF15: Finance verification step.
vendorRouter.post(
  "/:id/verify",
  requirePermission(PERMISSIONS.VENDOR_APPROVE),
  asyncHandler(async (req, res) => {
    const vendor = await vendorService.verifyVendor(requireOrg(req), req.params.id, req.user!.sub);
    res.json({ data: vendor });
  })
);

// WF15: final management approval step.
vendorRouter.post(
  "/:id/approve",
  requirePermission(PERMISSIONS.VENDOR_APPROVE),
  asyncHandler(async (req, res) => {
    const vendor = await vendorService.approveVendor(requireOrg(req), req.params.id, req.user!.sub);
    res.json({ data: vendor });
  })
);

vendorRouter.post(
  "/:id/ratings",
  requirePermission(PERMISSIONS.VENDOR_UPDATE),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      purchaseOrderId: z.string().optional(),
      deliveryRating: z.number().int(),
      qualityRating: z.number().int(),
      priceRating: z.number().int(),
    });
    const input = schema.parse(req.body);
    const vendor = await vendorService.rateVendor(requireOrg(req), req.params.id, input, req.user!.sub);
    res.json({ data: vendor });
  })
);
