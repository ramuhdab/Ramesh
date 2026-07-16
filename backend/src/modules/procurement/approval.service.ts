import { prisma } from "../../lib/prisma";
import { eventBus } from "../../lib/eventBus";
import { AppError } from "../../middleware/errorHandler";
import { SYSTEM_ROLES } from "../../utils/permissions";

/**
 * Generic, configurable approval-chain engine (02-Architecture.md Section 5),
 * driving both WF7/WF17 (procurement/indent approvals: Tech Manager ->
 * Senior Manager -> Finance -> Managing Director) and WF21 (escalation).
 * Levels come from ApprovalWorkflow master data (WF35); if an organization
 * hasn't configured one for a given process type, DEFAULT_LEVELS is used so
 * the feature works out of the box.
 */

const DEFAULT_LEVELS = [SYSTEM_ROLES.TECH_MANAGER, SYSTEM_ROLES.SENIOR_MANAGER, SYSTEM_ROLES.FINANCE, SYSTEM_ROLES.MANAGING_DIRECTOR];
const DEFAULT_ESCALATION_HOURS = 24;

export type ApprovableEntityType = "procurement_request" | "indent";

async function getWorkflowConfig(organizationId: string, processType: "procurement" | "indent") {
  const config = await prisma.approvalWorkflow.findFirst({ where: { organizationId, processType, isActive: true } });
  const levels = (config?.levels as string[] | undefined) ?? DEFAULT_LEVELS;
  const escalationHours = config?.escalationHours ?? DEFAULT_ESCALATION_HOURS;
  return { levels, escalationHours };
}

/** Starts an approval chain for a newly created procurement request or indent. */
export async function startApprovalChain(organizationId: string, entityType: ApprovableEntityType, entityId: string, processType: "procurement" | "indent") {
  const { levels, escalationHours } = await getWorkflowConfig(organizationId, processType);
  await prisma.approvalAction.create({
    data: {
      organizationId,
      entityType,
      entityId,
      level: 0,
      decision: "pending",
      slaDueAt: new Date(Date.now() + escalationHours * 60 * 60 * 1000),
    },
  });
  return levels;
}

/**
 * Records an approve/reject decision at the current level for the calling
 * user. Verifies the caller actually holds the role required at this level
 * (WF7/WF17's role chain) before accepting the decision.
 */
export async function decide(
  organizationId: string,
  entityType: ApprovableEntityType,
  entityId: string,
  processType: "procurement" | "indent",
  approverUserId: string,
  approverRoles: string[],
  decision: "approved" | "rejected"
): Promise<{ done: boolean; finalDecision: "approved" | "rejected" | null; nextLevel: number }> {
  const { levels, escalationHours } = await getWorkflowConfig(organizationId, processType);

  const currentAction = await prisma.approvalAction.findFirst({
    where: { organizationId, entityType, entityId, decision: "pending" },
    orderBy: { level: "desc" },
  });
  if (!currentAction) {
    throw new AppError(409, "NO_PENDING_APPROVAL", "There is no pending approval step for this item.");
  }

  const requiredRole = levels[currentAction.level];
  if (requiredRole && !approverRoles.includes(requiredRole)) {
    throw new AppError(403, "WRONG_APPROVER_ROLE", `This approval step requires the "${requiredRole}" role.`);
  }

  // Atomically "claim" this specific pending row: the WHERE clause re-checks
  // decision: "pending" at write time, so if a concurrent decide() call (or
  // checkEscalations()) already flipped it away from pending, this update
  // matches zero rows and we reject instead of silently proceeding to
  // create a second, duplicate ApprovalAction at the same next level. This
  // closes the double-submit / escalation race flagged in code review.
  const claim = await prisma.approvalAction.updateMany({
    where: { id: currentAction.id, decision: "pending" },
    data: { decision, approverUserId, actedAt: new Date() },
  });
  if (claim.count === 0) {
    throw new AppError(409, "ALREADY_DECIDED", "This approval step was already decided (or escalated) by someone else. Refresh and try again.");
  }

  eventBus.publish({
    type: `approval.${decision}`,
    organizationId,
    actorUserId: approverUserId,
    payload: { entityType, entityId, level: currentAction.level },
  });

  if (decision === "rejected") {
    return { done: true, finalDecision: "rejected", nextLevel: currentAction.level };
  }

  const nextLevel = currentAction.level + 1;
  if (nextLevel >= levels.length) {
    return { done: true, finalDecision: "approved", nextLevel };
  }

  await prisma.approvalAction.create({
    data: {
      organizationId,
      entityType,
      entityId,
      level: nextLevel,
      decision: "pending",
      slaDueAt: new Date(Date.now() + escalationHours * 60 * 60 * 1000),
    },
  });

  // Tell whoever holds the next level's role that it's now their turn - see
  // notification.service.ts's notifyRoles handling. Without this, the chain
  // silently advances and the next approver only finds out by opening the
  // Procurement/Recovery screen unprompted.
  const nextRole = levels[nextLevel];
  if (nextRole) {
    eventBus.publish({
      type: "approval.pending",
      organizationId,
      payload: { entityType, entityId, level: nextLevel },
      notifyRoles: [nextRole],
    });
  }

  return { done: false, finalDecision: null, nextLevel };
}

export async function getApprovalHistory(organizationId: string, entityType: ApprovableEntityType, entityId: string) {
  return prisma.approvalAction.findMany({ where: { organizationId, entityType, entityId }, orderBy: { level: "asc" } });
}

/**
 * WF25 Dashboard "pending approvals" KPI: counts pending approval steps
 * whose required role (per that entity's configured chain) the caller
 * currently holds. Reuses getWorkflowConfig so this can never drift from the
 * actual role chain decide()/checkEscalations() enforce - a small in-memory
 * cache keyed by processType avoids re-querying ApprovalWorkflow master data
 * once per pending row on organizations with many open approvals.
 */
export async function countPendingApprovalsForRoles(organizationId: string, roles: string[]): Promise<number> {
  const pending = await prisma.approvalAction.findMany({ where: { organizationId, decision: "pending" } });
  if (pending.length === 0) return 0;

  const configCache = new Map<string, string[]>();
  let count = 0;
  for (const action of pending) {
    const processType = action.entityType === "procurement_request" ? "procurement" : "indent";
    let levels = configCache.get(processType);
    if (!levels) {
      levels = (await getWorkflowConfig(organizationId, processType)).levels;
      configCache.set(processType, levels);
    }
    const requiredRole = levels[action.level];
    if (requiredRole && roles.includes(requiredRole)) count++;
  }
  return count;
}

/**
 * WF21 Approval Escalation Workflow. Intended to run periodically (see
 * server.ts). Simplification flagged: the source spec distinguishes a
 * 24-hour "reminder" from a 48-hour "escalation to higher authority"; this
 * v1 implementation folds both into a single escalation step once an
 * approval's SLA (slaDueAt, set from the workflow's escalationHours) has
 * passed - it publishes an event (which the Notifications module turns into
 * a reminder/alert) and advances the chain to skip the stalled approver.
 * If a distinct two-stage reminder/escalation is required, add a
 * `remindedAt` column and split this into two passes.
 */
export async function checkEscalations() {
  const overdue = await prisma.approvalAction.findMany({
    where: { decision: "pending", slaDueAt: { lt: new Date() } },
  });

  for (const action of overdue) {
    // Same atomic-claim pattern as decide(): only proceed to escalate (and
    // create the next-level row) if this row was still actually pending at
    // write time - avoids double-escalating if a human decide() call raced
    // this same tick, or if two overlapping cron runs picked up the same row.
    const claim = await prisma.approvalAction.updateMany({
      where: { id: action.id, decision: "pending" },
      data: { decision: "escalated" },
    });
    if (claim.count === 0) continue;

    const { levels, escalationHours } = await getWorkflowConfig(
      action.organizationId,
      action.entityType === "procurement_request" ? "procurement" : "indent"
    );
    const nextLevel = action.level + 1;
    const nextRole = levels[nextLevel];

    // notifyRoles here targets the NEXT level's role, not the stalled one -
    // they're the one who now needs to act (see decide()'s equivalent
    // "approval.pending" publish for the non-escalated advance path).
    eventBus.publish({
      type: "approval.escalated",
      organizationId: action.organizationId,
      payload: { entityType: action.entityType, entityId: action.entityId, level: action.level },
      notifyRoles: nextRole ? [nextRole] : undefined,
    });

    if (nextLevel < levels.length) {
      await prisma.approvalAction.create({
        data: {
          organizationId: action.organizationId,
          entityType: action.entityType,
          entityId: action.entityId,
          level: nextLevel,
          decision: "pending",
          slaDueAt: new Date(Date.now() + escalationHours * 60 * 60 * 1000),
        },
      });
    }
  }

  return overdue.length;
}
