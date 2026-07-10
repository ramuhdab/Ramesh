import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { asyncHandler } from "../../utils/asyncHandler";
import { AppError } from "../../middleware/errorHandler";
import * as attachmentService from "./attachment.service";

// Buffered in memory, not disk - files are capped at 10MB (enforced again in
// attachment.service.ts) and immediately handed to the storage adapter, so a
// temp-file step on the local disk would be pure overhead here.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export const attachmentRouter = Router();
attachmentRouter.use(authenticate);

function requireOrg(req: any): string {
  const orgId = req.user?.organizationId;
  if (!orgId) throw new AppError(400, "NO_ORGANIZATION_CONTEXT", "This action requires an organization context.");
  return orgId;
}

// FR-33/WF30 (05-API-Specification.md Section 14): "authenticated" is the
// only permission listed for these routes - deliberately no dedicated
// attachment:* permission. Any finer-grained gating (e.g. "only Finance can
// attach vendor documents") belongs to the calling module's own route, which
// can check its own permission before calling this endpoint - this module
// stays generic and entity-scoped rather than reimplementing every other
// module's authorization rules.
attachmentRouter.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError(400, "FILE_REQUIRED", 'No file was uploaded (expected a multipart field named "file").');
    }
    const { entityType, entityId } = z.object({ entityType: z.string().min(1), entityId: z.string().min(1) }).parse(req.body);
    const attachment = await attachmentService.uploadAttachment(
      requireOrg(req),
      { entityType, entityId, fileName: req.file.originalname, mimeType: req.file.mimetype, buffer: req.file.buffer },
      req.user!.sub
    );
    res.status(201).json({ data: attachment });
  })
);

attachmentRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { entityType, entityId } = z.object({ entityType: z.string().min(1), entityId: z.string().min(1) }).parse(req.query);
    const attachments = await attachmentService.listAttachmentsForEntity(requireOrg(req), entityType, entityId);
    res.json({ data: attachments, meta: { count: attachments.length } });
  })
);

// Entity-scoped preview/download - streams the file back with its original
// content type rather than redirecting to a raw storage URL, so access
// control (organization ownership + virus-scan status) is re-checked on
// every download, not just at upload time.
attachmentRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { attachment, buffer } = await attachmentService.getAttachmentForDownload(requireOrg(req), req.params.id);
    res.setHeader("Content-Type", attachment.mimeType ?? "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Only a small, explicitly-safe set of types (plain raster images + PDF)
    // are ever rendered inline - everything else forces a download. This
    // closes a stored-XSS path an earlier version had via SVG uploads
    // (image/svg+xml can embed <script>) served with Content-Disposition:
    // inline (flagged in code review) - see attachment.service.ts isInlineSafe().
    const disposition = attachmentService.isInlineSafe(attachment.mimeType) ? "inline" : "attachment";
    res.setHeader("Content-Disposition", `${disposition}; filename="${encodeURIComponent(attachment.fileName)}"`);
    res.send(buffer);
  })
);

attachmentRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await attachmentService.deleteAttachment(requireOrg(req), req.user!.sub, req.user!.roles, req.params.id);
    res.status(204).send();
  })
);
