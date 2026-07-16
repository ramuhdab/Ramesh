import cron from "node-cron";
import { prisma } from "./prisma";
import { logger } from "./logger";
import { getStockAlerts } from "../modules/inventory/inventory.service";
import { autoCreateProcurementForLowStock } from "../modules/procurement/procurement.service";
import { checkEscalations } from "../modules/procurement/approval.service";

/**
 * In-process scheduled jobs (02-Architecture.md Section 2: "node-cron
 * in-process ... avoids running a separate queue/worker service for a
 * pilot-scale product"). Two jobs:
 *  - WF18/WF19 stock scan: every 15 minutes, auto-raise a procurement
 *    request for any item under its low/critical threshold.
 *  - WF21 approval escalation: every 15 minutes, escalate any approval past
 *    its SLA due date.
 * Daily backup (WF27) is NOT scheduled here - it is documented as an
 * infrastructure-level job in the deployment guides (managed DB snapshot +
 * a cron-triggered pg_dump to object storage), not application code,
 * per docs/04-Module-Breakdown.md's "Platform Ops" module notes.
 */
export function startScheduler() {
  cron.schedule("*/15 * * * *", async () => {
    let organizations: { id: string }[] = [];
    try {
      organizations = await prisma.organization.findMany({ where: { status: "active" }, select: { id: true } });
    } catch (err) {
      logger.error("Stock alert scan: failed to list organizations", { error: err instanceof Error ? err.message : String(err) });
      return;
    }

    // Each organization is isolated in its own try/catch so one tenant's
    // failure (bad data, a transient DB hiccup on one query) doesn't skip
    // every other tenant for this tick.
    for (const org of organizations) {
      try {
        const alerts = await getStockAlerts(org.id);
        for (const alert of alerts) {
          await autoCreateProcurementForLowStock(org.id, alert.itemId, alert.level);
        }
      } catch (err) {
        logger.error("Stock alert scan failed for organization", { organizationId: org.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  });

  cron.schedule("*/15 * * * *", async () => {
    try {
      const count = await checkEscalations();
      if (count > 0) logger.info(`Escalated ${count} overdue approval(s).`);
    } catch (err) {
      logger.error("Approval escalation check failed", { error: err instanceof Error ? err.message : String(err) });
    }
  });

  logger.info("Scheduler started (stock alerts + approval escalation, every 15 minutes).");
}
