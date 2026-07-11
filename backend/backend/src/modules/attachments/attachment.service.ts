import { prisma } from "../../lib/prisma";
import { eventBus } from "../../lib/eventBus";
import { AppError } from "../../middleware/errorHandler";
import { storage } from "../../lib/storage.adapter";
import { virusScanner } from "../../lib/virusScan.adapter";
import { SYSTEM_ROLES } from "../../utils/permissions";

/**
 * Attachments module - FR-33/WF30. Generic: files are uploaded, scanned,
 * stored, and linked to an entity by (entityType, entityId); other modules
 * reference attachments by ID instead of re-implementing upload handling
 * (04-Module-Breakdown.md, Module 13). Entity ownership itself is NOT
 * validated here (e.g. that `entityId` really is a vendor belonging to this
 * organization) - that would require this generic module to know about
 * every other module's schema. Instead, every attachment carries its own
 * `organizationId` from the uploader's session and access is scoped to that,
 * which is the same multi-tenancy boundary every other module enforces.
 */

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB - generous for scanned documents/photos, keeps storage cost low

// Deliberately an explicit allowlist of exact/prefix matches, NOT a bare
// "image/" prefix - image/svg+xml would match that and SVG can embed
// <script>, which combined with the "inline" Content-Disposition on download
// (see attachment.routes.ts) would be a stored-XSS vector (flagged in code
// review). Raster-only image types are safe to render inline; everything
// else is forced to download instead - see downloadDisposition() below.
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const ALLOWED_MIME_PREFIXES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "text/csv",
  "text/plain",
];
const INLINE_SAFE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);

/** True if this MIME type is safe to serve with Content-Disposition: inline; everything else downloads instead. */
export function isInlineSafe(mimeType: string | null | undefined): boolean {
  return !!mimeType && INLINE_SAFE_MIME_TYPES.has(mimeType);
}

// The entity types attachments are currently expected against (per BRD
// examples: vendor documents, employee documents, damage-report photos).
// Extend this set as new modules adopt attachments - it exists to catch
// typos/garbage in `entityType` early, not to enforce cross-module ownership.
const ALLOWED_ENTITY_TYPES = new Set([
  "vendor",
  "employee",
  "lost_damaged_report",
  "procurement_request",
  "indent",
  "purchase_order",
]);

function assertUploadAllowed(mimeType: string | undefined, size: number) {
  if (size > MAX_FILE_SIZE_BYTES) {
    throw new AppError(400, "FILE_TOO_LARGE", `File exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit.`);
  }
  // Fail closed: a missing/blank mimetype is rejected, not silently allowed -
  // a bare `if (mimeType && ...)` would let an unset Content-Type bypass the
  // allowlist entirely (flagged in code review).
  const isAllowed = !!mimeType && (ALLOWED_MIME_TYPES.has(mimeType) || ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix)));
  if (!isAllowed) {
    throw new AppError(400, "UNSUPPORTED_FILE_TYPE", `File type "${mimeType || "(unknown)"}" is not supported.`);
  }
}

export async function uploadAttachment(
  organizationId: string,
  input: { entityType: string; entityId: string; fileName: string; mimeType?: string; buffer: Buffer },
  uploadedBy: string
) {
  if (!ALLOWED_ENTITY_TYPES.has(input.entityType)) {
    throw new AppError(400, "INVALID_ENTITY_TYPE", `Attachments cannot be linked to entity type "${input.entityType}".`);
  }
  assertUploadAllowed(input.mimeType, input.buffer.length);

  const scanResult = await virusScanner.scan(input.buffer, input.fileName);
  const stored = await storage.save(input.buffer, input.fileName);

  const attachment = await prisma.attachment.create({
    data: {
      organizationId,
      entityType: input.entityType,
      entityId: input.entityId,
      fileUrl: stored.ref, // opaque storage reference, not a public URL - see storage.adapter.ts
      fileName: input.fileName,
      mimeType: input.mimeType,
      virusScanStatus: scanResult,
      uploadedBy,
    },
  });

  eventBus.publish({
    type: "attachment.uploaded",
    organizationId,
    actorUserId: uploadedBy,
    payload: { attachmentId: attachment.id, entityType: input.entityType, entityId: input.entityId, fileName: input.fileName },
  });

  if (scanResult === "infected") {
    // The record is kept (audit trail of the attempt, and the file itself
    // stays on disk for admin inspection) but download is blocked - see
    // getAttachmentForDownload. With today's stub scanner this branch is
    // unreachable in practice; it exists for when a real scanner is wired in.
    throw new AppError(422, "FILE_INFECTED", "The uploaded file failed the virus scan and was rejected.");
  }

  return attachment;
}

export async function listAttachmentsForEntity(organizationId: string, entityType: string, entityId: string) {
  return prisma.attachment.findMany({
    where: { organizationId, entityType, entityId },
    orderBy: { uploadedAt: "desc" },
  });
}

// Note: a Super Admin's JWT always has organizationId=null (utils/tokens.ts)
// and every route in this module requires an organization context
// (requireOrg() in attachment.routes.ts throws before the service is ever
// reached), so there is no case where a platform Super Admin calls these -
// no organization-bypass parameter is needed here (an earlier version had
// one; it was dead code and was removed after code review).
export async function getAttachmentForDownload(organizationId: string, id: string) {
  const attachment = await prisma.attachment.findFirst({ where: { id, organizationId } });
  if (!attachment) {
    throw new AppError(404, "NOT_FOUND", "Attachment not found.");
  }
  if (attachment.virusScanStatus !== "clean") {
    throw new AppError(409, "FILE_NOT_AVAILABLE", "This file is not available for download.");
  }
  const buffer = await storage.read(attachment.fileUrl);
  return { attachment, buffer };
}

/**
 * FR-33/WF30 doesn't document a delete endpoint (05-API-Specification.md
 * Section 14 only lists POST/GET), so this is additive surface - kept
 * deliberately conservative: only the user who uploaded a file, or an
 * Organization Administrator, may delete it (flagged in code review: an
 * earlier version had no ownership check at all, letting any authenticated
 * user in the org delete anyone else's attachments).
 */
export async function deleteAttachment(organizationId: string, callerUserId: string, callerRoles: string[], id: string) {
  const attachment = await prisma.attachment.findFirst({ where: { id, organizationId } });
  if (!attachment) {
    throw new AppError(404, "NOT_FOUND", "Attachment not found.");
  }
  const isOwner = attachment.uploadedBy === callerUserId;
  const isOrgAdmin = callerRoles.includes(SYSTEM_ROLES.ORG_ADMIN);
  if (!isOwner && !isOrgAdmin) {
    throw new AppError(403, "FORBIDDEN", "Only the uploader or an Organization Administrator may delete this attachment.");
  }
  await storage.delete(attachment.fileUrl);
  await prisma.attachment.delete({ where: { id } });
}
