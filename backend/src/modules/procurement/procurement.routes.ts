import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../utils/asyncHandler";
import { PERMISSIONS } from "../../utils/permissions";
import { AppError } from "../../middleware/errorHandler";
import * as procurementService from "./procurement.service";

export const procurementRouter = Router();
procurementRouter.use(authenticate);

function requireOrg(req: any): string {
  const orgId = req.user?.organizationId;
  if (!orgId) throw new AppError(400, "NO_ORGANIZATION_CONTEXT", "This action requires an organization context.");
  return orgId;
}

procurementRouter.post(
  "/requests",
  requirePermission(PERMISSIONS.PROCUREMENT_CREATE),
  asyncHandler(async (req, res) => {
    const schema = z.object({ sourceType: z.enum(["low_stock", "critical_stock", "indent"]), inventoryItemId: z.string().optional(), quantity: z.number().int().positive() });
    const input = schema.parse(req.body);
    const request = await procurementService.createProcurementRequest(requireOrg(req), input, req.user!.sub);
    res.status(201).json({ data: request });
  })
);

procurementRouter.get(
  "/requests",
  requirePermission(PERMISSIONS.PROCUREMENT_VIEW),
  asyncHandler(async (req, res) => {
    const requests = await procurementService.listProcurementRequests(requireOrg(req));
    res.json({ data: requests, meta: { count: requests.length } });
  })
);

procurementRouter.get(
  "/:id/status",
  requirePermission(PERMISSIONS.PROCUREMENT_VIEW),
  asyncHandler(async (req, res) => {
    const status = await procurementService.getProcurementStatus(requireOrg(req), req.params.id);
    res.json({ data: status });
  })
);

procurementRouter.post(
  "/:id/approve",
  requirePermission(PERMISSIONS.PROCUREMENT_APPROVE),
  asyncHandler(async (req, res) => {
    const { decision } = z.object({ decision: z.enum(["approved", "rejected"]) }).parse(req.body);
    const updated = await procurementService.decideProcurementRequest(requireOrg(req), req.params.id, req.user!.sub, req.user!.roles, decision);
    res.json({ data: updated });
  })
);

procurementRouter.post(
  "/:id/cancel",
  requirePermission(PERMISSIONS.PROCUREMENT_CANCEL),
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
    const updated = await procurementService.cancelProcurementRequest(requireOrg(req), req.params.id, reason, req.user!.sub);
    res.json({ data: updated });
  })
);

export const indentRouter = Router();
indentRouter.use(authenticate);

indentRouter.post(
  "/",
  requirePermission(PERMISSIONS.PROCUREMENT_INDENT_CREATE),
  asyncHandler(async (req, res) => {
    const schema = z.object({ departmentId: z.string().optional(), items: z.array(z.record(z.unknown())).min(1) });
    const input = schema.parse(req.body);
    const indent = await procurementService.createIndent(requireOrg(req), input, req.user!.sub);
    res.status(201).json({ data: indent });
  })
);

indentRouter.get(
  "/",
  requirePermission(PERMISSIONS.PROCUREMENT_VIEW),
  asyncHandler(async (req, res) => {
    const indents = await procurementService.listIndents(requireOrg(req));
    res.json({ data: indents, meta: { count: indents.length } });
  })
);

indentRouter.post(
  "/:id/approve",
  requirePermission(PERMISSIONS.PROCUREMENT_APPROVE),
  asyncHandler(async (req, res) => {
    const { decision } = z.object({ decision: z.enum(["approved", "rejected"]) }).parse(req.body);
    const updated = await procurementService.decideIndent(requireOrg(req), req.params.id, req.user!.sub, req.user!.roles, decision);
    res.json({ data: updated });
  })
);
