import { prisma } from "../../lib/prisma";
import { eventBus } from "../../lib/eventBus";
import { AppError } from "../../middleware/errorHandler";

/**
 * Loss/Damage & Recovery module - WF12 (Lost Item), WF13 (Damaged Item,
 * standalone-report path; the return-triggered damage path lives in
 * inventory.service.ts returnItem()), WF26 (Recovery Calculation, the
 * shared engine used by exit/loss/damage per BRD FR-30).
 */

/** WF12/WF13: employee (via store keeper/manager) reports a lost or damaged item directly. */
export async function reportIncident(
  organizationId: string,
  input: { employeeId: string; inventoryItemId: string; itemIssuanceId?: string; type: "lost" | "damaged" },
  actorUserId?: string | null
) {
  const [employee, item] = await Promise.all([
    prisma.employee.findFirst({ where: { id: input.employeeId, organizationId } }),
    prisma.inventoryItem.findFirst({ where: { id: input.inventoryItemId, organizationId } }),
  ]);
  if (!employee) throw new AppError(404, "NOT_FOUND", "Employee not found.");
  if (!item) throw new AppError(404, "NOT_FOUND", "Inventory item not found.");

  const report = await prisma.lostDamagedReport.create({
    data: {
      organizationId,
      employeeId: input.employeeId,
      inventoryItemId: input.inventoryItemId,
      itemIssuanceId: input.itemIssuanceId,
      type: input.type,
    },
  });

  eventBus.publish({ type: `inventory.${input.type}_reported`, organizationId, actorUserId, payload: { id: report.id } });

  return report;
}

/** Manager verification step shared by WF12/WF13 before recovery calculation proceeds. */
export async function verifyIncident(organizationId: string, reportId: string, managerUserId: string) {
  const report = await prisma.lostDamagedReport.findFirst({ where: { id: reportId, organizationId } });
  if (!report) throw new AppError(404, "NOT_FOUND", "Report not found.");

  const updated = await prisma.lostDamagedReport.update({ where: { id: reportId }, data: { managerVerifiedBy: managerUserId } });
  eventBus.publish({ type: "inventory.incident_verified", organizationId, actorUserId: managerUserId, payload: { id: reportId } });
  return updated;
}

/**
 * WF26 Recovery Calculation: looks up the item's policy (recoverable value +
 * useful life) and straight-line depreciates it based on how long the item
 * was in use, per BRD FR-30 ("Join Date, Leave Date, Policy Lookup ->
 * Calculate Recovery"). Simplification flagged: depreciation is straight-line
 * month-based; the source spec doesn't prescribe a formula, so this is the
 * simplest reasonable one - revisit if Finance needs a different method.
 */
export async function calculateRecovery(
  organizationId: string,
  input: { employeeId: string; sourceType: "exit" | "loss" | "damage"; itemIssuanceId: string; lostDamagedReportId?: string },
  actorUserId?: string | null
) {
  const issuance = await prisma.itemIssuance.findFirst({
    where: { id: input.itemIssuanceId, organizationId },
    include: { inventoryItem: true, employee: true },
  });
  if (!issuance) throw new AppError(404, "NOT_FOUND", "Item issuance not found.");

  // For loss/damage, the incident date and manager-verification gate come
  // from the LostDamagedReport, not the employee's leaving date (which is
  // only meaningful for an "exit"). Bug fixed: this previously fell back to
  // `employee.leavingDate ?? new Date()` for every source type, which for a
  // loss/damage on an employee already mid-notice-period used a future
  // leave date instead of the actual incident date, and skipped the
  // manager-verification requirement entirely.
  let incidentDate: Date;
  if (input.sourceType === "exit") {
    incidentDate = issuance.employee.leavingDate ?? new Date();
  } else {
    if (!input.lostDamagedReportId) {
      throw new AppError(400, "REPORT_REQUIRED", "A lostDamagedReportId is required to calculate recovery for a loss/damage.");
    }
    const report = await prisma.lostDamagedReport.findFirst({
      where: { id: input.lostDamagedReportId, organizationId, employeeId: input.employeeId },
    });
    if (!report) throw new AppError(404, "NOT_FOUND", "Lost/damaged report not found.");
    if (!report.managerVerifiedBy) {
      throw new AppError(409, "INCIDENT_NOT_VERIFIED", "This report must be manager-verified before recovery can be calculated.");
    }
    incidentDate = report.reportedAt;
  }

  const policy = issuance.inventoryItem.inventoryCategoryId
    ? await prisma.itemPolicy.findFirst({ where: { organizationId, inventoryCategoryId: issuance.inventoryItem.inventoryCategoryId, isActive: true } })
    : null;

  const recoverableValue = Number(policy?.recoverableValue ?? 0);
  const usefulLifeMonths = policy?.usefulLifeMonths ?? 0;

  const joinDate = issuance.issuedAt; // "in service since" for this specific item

  let calculatedAmount = recoverableValue;
  if (recoverableValue > 0 && usefulLifeMonths > 0) {
    const monthsUsed = Math.max(0, (incidentDate.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
    const depreciationFraction = Math.min(monthsUsed / usefulLifeMonths, 1);
    calculatedAmount = Math.round(recoverableValue * (1 - depreciationFraction) * 100) / 100;
  }

  const recovery = await prisma.recoveryCalculation.create({
    data: {
      organizationId,
      employeeId: input.employeeId,
      sourceType: input.sourceType,
      itemIssuanceId: input.itemIssuanceId,
      joinDate,
      leaveOrIncidentDate: incidentDate,
      policyId: policy?.id,
      calculatedAmount,
    },
  });

  eventBus.publish({ type: "recovery.calculated", organizationId, actorUserId, payload: { id: recovery.id, calculatedAmount } });

  return recovery;
}

/** Finance verification / sign-off - required before an employee exit can complete, or a lost/damaged item can be replaced (FR-30). */
export async function financeVerifyRecovery(organizationId: string, recoveryId: string, financeUserId: string, salaryDeductionRef?: string) {
  const recovery = await prisma.recoveryCalculation.findFirst({ where: { id: recoveryId, organizationId } });
  if (!recovery) throw new AppError(404, "NOT_FOUND", "Recovery calculation not found.");
  if (recovery.financeVerifiedAt) throw new AppError(400, "ALREADY_VERIFIED", "This recovery has already been Finance-verified.");

  const updated = await prisma.recoveryCalculation.update({
    where: { id: recoveryId },
    data: { financeVerifiedBy: financeUserId, financeVerifiedAt: new Date(), salaryDeductionRef },
  });

  eventBus.publish({ type: "recovery.finance_verified", organizationId, actorUserId: financeUserId, payload: { id: recoveryId } });

  return updated;
}

export async function listRecoveryForEmployee(organizationId: string, employeeId: string) {
  return prisma.recoveryCalculation.findMany({ where: { organizationId, employeeId }, orderBy: { createdAt: "desc" } });
}
