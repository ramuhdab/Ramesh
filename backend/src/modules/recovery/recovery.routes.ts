import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../utils/asyncHandler";
import { PERMISSIONS } from "../../utils/permissions";
import { AppError } from "../../middleware/errorHandler";
import * as recoveryService from "./recovery.service";

export const recoveryRouter = Router();
recoveryRouter.use(authenticate);

function requireOrg(req: any): string {
  const orgId = req.user?.organizationId;
  if (!orgId) throw new AppError(400, "NO_ORGANIZATION_CONTEXT", "This action requires an organization context.");
  return orgId;
}

// Mounted at /api/v1/inventory in app.ts alongside inventory.routes.ts, per
// 05-API-Specification.md Section 8 ("Loss / Damage / Recovery").
recoveryRouter.post(
  "/lost",
  requirePermission(PERMISSIONS.INVENTORY_REPORT),
  asyncHandler(async (req, res) => {
    const schema = z.object({ employeeId: z.string(), inventoryItemId: z.string(), itemIssuanceId: z.string().optional() });
    const input = schema.parse(req.body);
    const report = await recoveryService.reportIncident(requireOrg(req), { ...input, type: "lost" }, req.user!.sub);
    res.status(201).json({ data: report });
  })
);

recoveryRouter.post(
  "/damaged",
  requirePermission(PERMISSIONS.INVENTORY_REPORT),
  asyncHandler(async (req, res) => {
    const schema = z.object({ employeeId: z.string(), inventoryItemId: z.string(), itemIssuanceId: z.string().optional() });
    const input = schema.parse(req.body);
    const report = await recoveryService.reportIncident(requireOrg(req), { ...input, type: "damaged" }, req.user!.sub);
    res.status(201).json({ data: report });
  })
);

// Org-wide incident queue - backs the Recovery screen's "Incidents" tab
// (verify + pick a report to calculate recovery from).
recoveryRouter.get(
  "/incidents",
  requirePermission(PERMISSIONS.INVENTORY_REPORT),
  asyncHandler(async (req, res) => {
    const incidents = await recoveryService.listIncidents(requireOrg(req));
    res.json({ data: incidents, meta: { count: incidents.length } });
  })
);

recoveryRouter.post(
  "/incidents/:id/verify",
  requirePermission(PERMISSIONS.EMPLOYEE_APPROVE),
  asyncHandler(async (req, res) => {
    const report = await recoveryService.verifyIncident(requireOrg(req), req.params.id, req.user!.sub);
    res.json({ data: report });
  })
);

export const recoveryCalcRouter = Router();
recoveryCalcRouter.use(authenticate);

recoveryCalcRouter.post(
  "/calculate",
  requirePermission(PERMISSIONS.RECOVERY_CALCULATE),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      employeeId: z.string(),
      sourceType: z.enum(["exit", "loss", "damage"]),
      itemIssuanceId: z.string(),
      lostDamagedReportId: z.string().optional(), // required by the service when sourceType is "loss" or "damage"
    });
    const input = schema.parse(req.body);
    const recovery = await recoveryService.calculateRecovery(requireOrg(req), input, req.user!.sub);
    res.status(201).json({ data: recovery });
  })
);

recoveryCalcRouter.post(
  "/:id/finance-verify",
  requirePermission(PERMISSIONS.RECOVERY_APPROVE),
  asyncHandler(async (req, res) => {
    const { salaryDeductionRef } = z.object({ salaryDeductionRef: z.string().optional() }).parse(req.body);
    const recovery = await recoveryService.financeVerifyRecovery(requireOrg(req), req.params.id, req.user!.sub, salaryDeductionRef);
    res.json({ data: recovery });
  })
);

// Org-wide recovery-calculation queue - backs the Recovery screen's Finance
// verification tab.
recoveryCalcRouter.get(
  "/",
  requirePermission(PERMISSIONS.RECOVERY_CALCULATE),
  asyncHandler(async (req, res) => {
    const records = await recoveryService.listRecoveryCalculations(requireOrg(req));
    res.json({ data: records, meta: { count: records.length } });
  })
);

recoveryCalcRouter.get(
  "/employee/:employeeId",
  requirePermission(PERMISSIONS.RECOVERY_CALCULATE),
  asyncHandler(async (req, res) => {
    const records = await recoveryService.listRecoveryForEmployee(requireOrg(req), req.params.employeeId);
    res.json({ data: records });
  })
);
