import { prisma } from "../../lib/prisma";
import { eventBus } from "../../lib/eventBus";
import { sendMail } from "./mail.adapter";
import { AppError } from "../../middleware/errorHandler";

/**
 * WF22 Notification Workflow: events -> email + bell (+ optional SMS/push, v2).
 * This module never gets called directly by other modules - it only reacts
 * to domain events published on the event bus (02-Architecture.md, Section 5).
 */

const EVENT_MESSAGES: Record<string, (payload: any) => { subject: string; body: string }> = {
  "organization.created": (p) => ({ subject: "Organization created", body: `Organization "${p.name}" was created.` }),
  "organization.activated": () => ({ subject: "Organization activated", body: "The organization is now active." }),
  "user.created": (p) => ({ subject: "Account created", body: `An account was created for ${p.email ?? p.username}.` }),
  "user.role_assigned": () => ({ subject: "Role assignment changed", body: "Your role assignment has changed." }),
  "employee.created": (p) => ({ subject: "Employee created", body: `Employee ${p.name ?? p.employeeCode} was created.` }),
  "procurement.requested": () => ({ subject: "Procurement request submitted", body: "A new procurement request needs approval." }),
  "procurement.po_issued": () => ({ subject: "Purchase order issued", body: "A purchase order has been issued to the vendor." }),
  "procurement.cancelled": (p) => ({ subject: "Procurement cancelled", body: `Reason: ${p.reason ?? "not specified"}.` }),
  "procurement.indent_raised": () => ({ subject: "Indent submitted", body: "A new indent needs approval." }),
  "approval.escalated": () => ({ subject: "Approval escalated", body: "An approval has passed its SLA and was escalated to the next level." }),
  "vendor.approved": () => ({ subject: "Vendor approved", body: "A vendor has completed approval and can now receive purchase orders." }),
  "recovery.calculated": (p) => ({ subject: "Recovery amount calculated", body: `Calculated recovery amount: ${p.calculatedAmount}.` }),
  "recovery.finance_verified": () => ({ subject: "Recovery verified by Finance", body: "A recovery calculation has been Finance-verified." }),
  "inventory.lost_reported": () => ({ subject: "Item reported lost", body: "A lost item report has been filed." }),
  "inventory.damaged_reported": () => ({ subject: "Item reported damaged", body: "A damaged item report has been filed." }),
};

/**
 * Events whose originating service already sends a purpose-built email
 * directly (e.g. one containing a temporary password or activation token -
 * see organization.service.ts / user.service.ts). This module still records
 * the bell notification for those events, it just doesn't ALSO send a
 * second, generic email - otherwise recipients get duplicate emails.
 */
const EMAIL_ALREADY_SENT_DIRECTLY = new Set(["organization.created", "user.created"]);

export async function listUserNotifications(organizationId: string, userId: string) {
  return prisma.notification.findMany({
    where: { organizationId, userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function markNotificationRead(organizationId: string, userId: string, id: string) {
  // Scoped so a caller can only mark their own organization's/own notifications
  // as read - never accept a bare id without this check (multi-tenancy rule,
  // see 02-Architecture.md Section 3 and skills/spqr-inventory-dev-standards.md).
  const existing = await prisma.notification.findFirst({ where: { id, organizationId, userId } });
  if (!existing) {
    throw new AppError(404, "NOT_FOUND", "Notification not found.");
  }
  return prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
}

eventBus.on("*", async (event) => {
  const template = EVENT_MESSAGES[event.type];
  if (!template || !event.organizationId) return;

  const { subject, body } = template(event.payload ?? {});

  try {
    await prisma.notification.create({
      data: {
        organizationId: event.organizationId,
        userId: event.actorUserId ?? null,
        channel: "bell",
        eventType: event.type,
        payload: event.payload as any,
        sentAt: new Date(),
      },
    });

    const recipientEmail = (event.payload as any)?.email;
    if (recipientEmail && !EMAIL_ALREADY_SENT_DIRECTLY.has(event.type)) {
      await sendMail({ to: recipientEmail, subject, body });
    }
  } catch (err) {
    // Notification failures must never break the triggering transaction.
    // eslint-disable-next-line no-console
    console.error("Failed to dispatch notification for event", event.type, err);
  }
});
