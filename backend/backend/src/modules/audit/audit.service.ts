import { prisma } from "../../lib/prisma";
import { eventBus } from "../../lib/eventBus";

export type AuditContext = {
  organizationId?: string | null;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type AuditEntry = AuditContext & {
  entityType: string;
  entityId?: string | null;
  action: string; // create|update|delete|approve|export|login|...
  oldValue?: unknown;
  newValue?: unknown;
};

/**
 * Writes an immutable audit log row (BRD FR-27 / WF23: old value, new value,
 * user, IP, browser, on every transaction). Called directly by services for
 * fine-grained control, and also subscribed to the event bus so it captures
 * domain events published by any module without those modules needing to
 * know the Audit module exists (02-Architecture.md, Section 5).
 */
export async function writeAuditLog(entry: AuditEntry) {
  await prisma.auditLog.create({
    data: {
      organizationId: entry.organizationId ?? null,
      userId: entry.userId ?? null,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      action: entry.action,
      oldValue: entry.oldValue as any,
      newValue: entry.newValue as any,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    },
  });
}

// Cross-cutting subscription: every domain event is captured in the audit trail.
eventBus.on("*", async (event) => {
  try {
    await writeAuditLog({
      organizationId: event.organizationId ?? null,
      userId: event.actorUserId ?? null,
      entityType: event.type.split(".")[0],
      entityId: (event.payload?.id as string | undefined) ?? null,
      action: event.type,
      newValue: event.payload,
    });
  } catch (err) {
    // Audit logging must never crash the request that triggered it; log and move on.
    // eslint-disable-next-line no-console
    console.error("Failed to write audit log for event", event.type, err);
  }
});
