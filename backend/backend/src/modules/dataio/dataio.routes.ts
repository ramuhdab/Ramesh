import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../utils/asyncHandler";
import { AppError } from "../../middleware/errorHandler";
import { PERMISSIONS } from "../../utils/permissions";
import * as importService from "./import.service";
import * as exportService from "./export.service";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function requireOrg(req: any): string {
  const orgId = req.user?.organizationId;
  if (!orgId) throw new AppError(400, "NO_ORGANIZATION_CONTEXT", "This action requires an organization context.");
  return orgId;
}

// FR-34/WF34 (05-API-Specification.md Section 13).
export const importRouter = Router();
importRouter.use(authenticate);

importRouter.get(
  "/:module/template",
  requirePermission(PERMISSIONS.DATA_IMPORT),
  asyncHandler(async (req, res) => {
    const buffer = await importService.buildTemplateWorkbook(req.params.module);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${req.params.module}-template.xlsx"`);
    res.send(buffer);
  })
);

importRouter.get(
  "/:module/jobs",
  requirePermission(PERMISSIONS.DATA_IMPORT),
  asyncHandler(async (req, res) => {
    const jobs = await importService.listImportJobs(requireOrg(req), req.params.module);
    res.json({ data: jobs, meta: { count: jobs.length } });
  })
);

importRouter.post(
  "/:module",
  requirePermission(PERMISSIONS.DATA_IMPORT),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError(400, "FILE_REQUIRED", 'No file was uploaded (expected a multipart field named "file").');
    }
    const result = await importService.runImport(
      requireOrg(req),
      req.params.module,
      { buffer: req.file.buffer, mimeType: req.file.mimetype, originalName: req.file.originalname },
      req.user!.sub
    );
    res.status(201).json({ data: result });
  })
);

export const exportRouter = Router();
exportRouter.use(authenticate);

exportRouter.post(
  "/:module",
  requirePermission(PERMISSIONS.DATA_EXPORT),
  asyncHandler(async (req, res) => {
    const { format } = z.object({ format: z.enum(["xlsx", "csv", "pdf"]).default("xlsx") }).parse(req.body ?? {});
    const result = await exportService.runExport(requireOrg(req), req.params.module, format, req.user!.sub);
    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
    res.send(result.buffer);
  })
);

exportRouter.get(
  "/:module/jobs",
  requirePermission(PERMISSIONS.DATA_EXPORT),
  asyncHandler(async (req, res) => {
    const jobs = await exportService.listExportJobs(requireOrg(req), req.params.module);
    res.json({ data: jobs, meta: { count: jobs.length } });
  })
);
