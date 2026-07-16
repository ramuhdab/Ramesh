import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../utils/asyncHandler";
import { PERMISSIONS } from "../../utils/permissions";
import { AppError } from "../../middleware/errorHandler";
import * as inventoryService from "./inventory.service";

export const inventoryRouter = Router();
inventoryRouter.use(authenticate);

function requireOrg(req: any): string {
  const orgId = req.user?.organizationId;
  if (!orgId) throw new AppError(400, "NO_ORGANIZATION_CONTEXT", "This action requires an organization context.");
  return orgId;
}

inventoryRouter.post(
  "/items",
  requirePermission(PERMISSIONS.INVENTORY_ITEM_CREATE),
  asyncHandler(async (req, res) => {
    const schema = z.object({ itemCode: z.string().min(1), name: z.string().min(1), inventoryCategoryId: z.string().optional(), unitCost: z.number().optional() });
    const input = schema.parse(req.body);
    const item = await inventoryService.createItem(requireOrg(req), input);
    res.status(201).json({ data: item });
  })
);

inventoryRouter.get(
  "/items",
  requirePermission(PERMISSIONS.INVENTORY_ITEM_VIEW),
  asyncHandler(async (req, res) => {
    const items = await inventoryService.listItems(requireOrg(req));
    res.json({ data: items, meta: { count: items.length } });
  })
);

inventoryRouter.get(
  "/items/:id",
  requirePermission(PERMISSIONS.INVENTORY_ITEM_VIEW),
  asyncHandler(async (req, res) => {
    const item = await inventoryService.getItem(requireOrg(req), req.params.id);
    res.json({ data: item });
  })
);

inventoryRouter.get(
  "/alerts",
  requirePermission(PERMISSIONS.INVENTORY_ITEM_VIEW),
  asyncHandler(async (req, res) => {
    const alerts = await inventoryService.getStockAlerts(requireOrg(req));
    res.json({ data: alerts, meta: { count: alerts.length } });
  })
);

// GET /api/v1/inventory/issuances - who has what (optionally filtered to one
// employee). Backs the Issue/Return screens - see listIssuances() for why
// this is needed beyond the write endpoints below.
inventoryRouter.get(
  "/issuances",
  requirePermission(PERMISSIONS.INVENTORY_ITEM_VIEW),
  asyncHandler(async (req, res) => {
    const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : undefined;
    const issuances = await inventoryService.listIssuances(requireOrg(req), employeeId);
    res.json({ data: issuances, meta: { count: issuances.length } });
  })
);

inventoryRouter.post(
  "/goods-receipt",
  requirePermission(PERMISSIONS.INVENTORY_RECEIVE),
  asyncHandler(async (req, res) => {
    const schema = z.object({ inventoryItemId: z.string(), quantity: z.number().int().positive(), decision: z.enum(["accept", "reject"]) });
    const input = schema.parse(req.body);
    const result = await inventoryService.goodsReceipt(requireOrg(req), input, req.user!.sub);
    res.json({ data: result });
  })
);

inventoryRouter.post(
  "/issue",
  requirePermission(PERMISSIONS.INVENTORY_ISSUE),
  asyncHandler(async (req, res) => {
    const schema = z.object({ employeeId: z.string(), inventoryItemId: z.string(), quantity: z.number().int().positive(), signatureRef: z.string().optional() });
    const input = schema.parse(req.body);
    const issuance = await inventoryService.issueItem(requireOrg(req), input, req.user!.sub);
    res.status(201).json({ data: issuance });
  })
);

inventoryRouter.post(
  "/return",
  requirePermission(PERMISSIONS.INVENTORY_RETURN),
  asyncHandler(async (req, res) => {
    const schema = z.object({ itemIssuanceId: z.string(), quantity: z.number().int().positive(), condition: z.enum(["good", "damaged"]) });
    const input = schema.parse(req.body);
    const result = await inventoryService.returnItem(requireOrg(req), input, req.user!.sub);
    res.status(201).json({ data: result });
  })
);

// WF11: manager-approval gated (shares INVENTORY_ADJUST with WF14 adjustments).
inventoryRouter.post(
  "/replace",
  requirePermission(PERMISSIONS.INVENTORY_ADJUST),
  asyncHandler(async (req, res) => {
    const schema = z.object({ employeeId: z.string(), oldItemIssuanceId: z.string().optional(), newInventoryItemId: z.string(), quantity: z.number().int().positive(), reason: z.string().min(1) });
    const input = schema.parse(req.body);
    const issuance = await inventoryService.replaceItem(requireOrg(req), input, req.user!.sub);
    res.status(201).json({ data: issuance });
  })
);

inventoryRouter.post(
  "/adjust",
  requirePermission(PERMISSIONS.INVENTORY_ADJUST),
  asyncHandler(async (req, res) => {
    const schema = z.object({ inventoryItemId: z.string(), newQuantity: z.number().int().min(0), reason: z.string().min(1) });
    const input = schema.parse(req.body);
    const item = await inventoryService.adjustStock(requireOrg(req), input, req.user!.sub);
    res.json({ data: item });
  })
);
