import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../utils/asyncHandler";
import { AppError } from "../../middleware/errorHandler";
import { PERMISSIONS } from "../../utils/permissions";
import * as dashboardService from "./dashboard.service";
import * as reportService from "./report.service";

function requireOrg(req: any): string {
  const orgId = req.user?.organizationId;
  if (!orgId) throw new AppError(400, "NO_ORGANIZATION_CONTEXT", "This action requires an organization context.");
  return orgId;
}

// FR-29/WF25 - "authenticated" only (every role gets a dashboard).
export const dashboardRouter = Router();
dashboardRouter.use(authenticate);
dashboardRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const dashboard = await dashboardService.getDashboard(requireOrg(req), req.user!.roles);
    res.json({ data: dashboard });
  })
);

// FR-28/WF24 - 05-API-Specification.md Section 12.
export const reportRouter = Router();
reportRouter.use(authenticate);

reportRouter.get(
  "/",
  requirePermission(PERMISSIONS.REPORTING_VIEW),
  asyncHandler(async (_req, res) => {
    res.json({ data: reportService.listReportKeys() });
  })
);

reportRouter.get(
  "/:reportKey",
  requirePermission(PERMISSIONS.REPORTING_VIEW),
  asyncHandler(async (req, res) => {
    const filters = z.record(z.string()).parse(req.query);
    const result = await reportService.previewReport(requireOrg(req), req.params.reportKey, filters);
    res.json({ data: result.rows, meta: { count: result.rows.length, label: result.label, columns: result.columns } });
  })
);

// FR-28 says reports download/print as "PDF or Excel" (pdf listed first),
// so pdf is the default here - but an explicitly-invalid format is now
// REJECTED with a 400 rather than silently coerced to pdf, matching
// dataio.routes.ts's export endpoint (flagged as an inconsistency in code
// review: this route used to substitute a default for any bad value).
const reportExportQuerySchema = z.object({ format: z.enum(["xlsx", "csv", "pdf"]).default("pdf") }).catchall(z.string());

reportRouter.get(
  "/:reportKey/export",
  requirePermission(PERMISSIONS.REPORTING_EXPORT),
  asyncHandler(async (req, res) => {
    const { format, ...filters } = reportExportQuerySchema.parse(req.query);
    const result = await reportService.exportReport(requireOrg(req), req.params.reportKey, format, filters);
    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
    res.send(result.buffer);
  })
);
