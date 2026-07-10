import { prisma } from "../../lib/prisma";
import { eventBus } from "../../lib/eventBus";
import { AppError } from "../../middleware/errorHandler";

/**
 * Employee Lifecycle module - WF3 (Creation), WF4 (Transfer), WF5 (Exit),
 * WF6 (Rehire). See docs/04-Module-Breakdown.md.
 */

/**
 * Every master-data foreign key coming from client input (building,
 * department, position, employee category) must be checked against
 * organizationId, not just existence - otherwise a caller in one org could
 * link a record from another org's master data (multi-tenancy rule, see
 * skills/spqr-inventory-dev-standards.md). This helper centralizes that
 * check instead of repeating it ad hoc per field.
 */
async function assertBelongsToOrg(organizationId: string, refs: { buildingId?: string; departmentId?: string; positionId?: string; employeeCategoryId?: string }) {
  const checks: Promise<void>[] = [];

  if (refs.buildingId) {
    checks.push(
      prisma.building.findFirst({ where: { id: refs.buildingId, organizationId } }).then((r) => {
        if (!r) throw new AppError(400, "INVALID_BUILDING", "Building does not belong to this organization.");
      })
    );
  }
  if (refs.departmentId) {
    checks.push(
      prisma.department.findFirst({ where: { id: refs.departmentId, organizationId } }).then((r) => {
        if (!r) throw new AppError(400, "INVALID_DEPARTMENT", "Department does not belong to this organization.");
      })
    );
  }
  if (refs.positionId) {
    checks.push(
      prisma.position.findFirst({ where: { id: refs.positionId, organizationId } }).then((r) => {
        if (!r) throw new AppError(400, "INVALID_POSITION", "Position does not belong to this organization.");
      })
    );
  }
  if (refs.employeeCategoryId) {
    checks.push(
      prisma.employeeCategory.findFirst({ where: { id: refs.employeeCategoryId, organizationId } }).then((r) => {
        if (!r) throw new AppError(400, "INVALID_EMPLOYEE_CATEGORY", "Employee category does not belong to this organization.");
      })
    );
  }

  await Promise.all(checks);
}

export async function createEmployee(input: {
  organizationId: string;
  employeeCode: string;
  name: string;
  joiningDate: string; // ISO date, mandatory per FR-7
  buildingId: string; // mandatory per FR-7
  positionId: string; // mandatory per FR-7
  departmentId?: string;
  employeeCategoryId?: string;
  actorUserId?: string | null;
}) {
  const existing = await prisma.employee.findFirst({
    where: { organizationId: input.organizationId, employeeCode: input.employeeCode },
  });
  if (existing) throw new AppError(409, "EMPLOYEE_CODE_TAKEN", "Employee ID must be unique.");

  const [building, position] = await Promise.all([
    prisma.building.findFirst({ where: { id: input.buildingId, organizationId: input.organizationId, isActive: true } }),
    prisma.position.findFirst({ where: { id: input.positionId, organizationId: input.organizationId, isActive: true } }),
  ]);
  if (!building) throw new AppError(400, "INVALID_BUILDING", "Building is mandatory and must be an active building in this organization.");
  if (!position) throw new AppError(400, "INVALID_POSITION", "Position is mandatory and must be an active position in this organization.");

  // buildingId/positionId already checked above (with the extra isActive
  // constraint); still validate department/category the same way the
  // mandatory fields were, so every FK is tenant-scoped consistently.
  await assertBelongsToOrg(input.organizationId, { departmentId: input.departmentId, employeeCategoryId: input.employeeCategoryId });

  const employee = await prisma.employee.create({
    data: {
      organizationId: input.organizationId,
      employeeCode: input.employeeCode,
      name: input.name,
      joiningDate: new Date(input.joiningDate),
      buildingId: input.buildingId,
      positionId: input.positionId,
      departmentId: input.departmentId,
      employeeCategoryId: input.employeeCategoryId,
      status: "active",
    },
  });

  await prisma.employeeHistoryEvent.create({
    data: { employeeId: employee.id, eventType: "created", details: { employeeCode: employee.employeeCode } },
  });

  eventBus.publish({
    type: "employee.created",
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    payload: { id: employee.id, employeeCode: employee.employeeCode, name: employee.name },
  });

  return employee;
}

/** Non-transfer, non-exit profile fields only - use /transfer or /exit for those (they have their own approval/business rules). */
export async function updateEmployee(
  organizationId: string,
  id: string,
  data: Partial<{ name: string; employeeCategoryId: string; positionId: string }>
) {
  await getEmployee(organizationId, id);
  await assertBelongsToOrg(organizationId, { positionId: data.positionId, employeeCategoryId: data.employeeCategoryId });
  return prisma.employee.update({ where: { id }, data });
}

export async function listEmployees(organizationId: string) {
  return prisma.employee.findMany({
    where: { organizationId },
    include: { building: true, department: true, position: true, employeeCategory: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getEmployee(organizationId: string, id: string) {
  const employee = await prisma.employee.findFirst({
    where: { id, organizationId },
    include: {
      building: true,
      department: true,
      position: true,
      employeeCategory: true,
      transfers: { orderBy: { createdAt: "desc" } },
      history: { orderBy: { eventAt: "desc" } },
    },
  });
  if (!employee) throw new AppError(404, "NOT_FOUND", "Employee not found.");
  return employee;
}

/**
 * WF4 Employee Transfer: requires manager approval (enforced by the route
 * requiring the `employee:approve` permission - see 05-API-Specification.md).
 * Inventory issued to the employee is unaffected by a transfer (FR-8).
 */
export async function transferEmployee(
  organizationId: string,
  employeeId: string,
  input: { toBuildingId?: string; toDepartmentId?: string },
  approverUserId: string
) {
  const employee = await getEmployee(organizationId, employeeId);
  await assertBelongsToOrg(organizationId, { buildingId: input.toBuildingId, departmentId: input.toDepartmentId });

  const transfer = await prisma.employeeTransfer.create({
    data: {
      employeeId,
      fromBuildingId: employee.buildingId,
      toBuildingId: input.toBuildingId ?? employee.buildingId,
      fromDepartmentId: employee.departmentId,
      toDepartmentId: input.toDepartmentId ?? employee.departmentId,
      approvedBy: approverUserId,
      approvedAt: new Date(),
    },
  });

  const updated = await prisma.employee.update({
    where: { id: employeeId },
    data: {
      buildingId: input.toBuildingId ?? employee.buildingId,
      departmentId: input.toDepartmentId ?? employee.departmentId,
      status: "transferred",
    },
  });

  await prisma.employeeHistoryEvent.create({
    data: { employeeId, eventType: "transferred", details: { transferId: transfer.id } },
  });

  eventBus.publish({ type: "employee.transferred", organizationId, actorUserId: approverUserId, payload: { id: employeeId } });

  return updated;
}

/**
 * WF5 Employee Exit, phase 1: mark the employee as leaving and start the
 * checklist. Nothing is finalized here - see completeExit().
 */
export async function initiateExit(organizationId: string, employeeId: string, leavingDate: string, actorUserId?: string | null) {
  await getEmployee(organizationId, employeeId);

  const updated = await prisma.employee.update({
    where: { id: employeeId },
    data: { status: "leaving", leavingDate: new Date(leavingDate) },
  });

  await prisma.employeeHistoryEvent.create({
    data: { employeeId, eventType: "exit_initiated", details: { leavingDate } },
  });

  eventBus.publish({ type: "employee.exit_initiated", organizationId, actorUserId, payload: { id: employeeId } });

  return updated;
}

/**
 * WF5 Employee Exit, phase 2: finalize the exit. Business rule (BRD FR-9):
 * cannot complete until recovery is calculated, inventory is returned, and
 * Finance has approved. Simplification (flagged for the user): an issuance
 * counts as "settled" if it has at least one ItemReturn recorded OR a
 * RecoveryCalculation with financeVerifiedAt set (i.e., paid for instead of
 * physically returned). Partial-quantity returns are not modeled in v1.
 */
export async function completeExit(organizationId: string, employeeId: string, actorUserId?: string | null) {
  const employee = await getEmployee(organizationId, employeeId);
  if (employee.status !== "leaving") {
    throw new AppError(400, "EXIT_NOT_INITIATED", "Call initiate-exit before completing an exit.");
  }

  const issuances = await prisma.itemIssuance.findMany({
    where: { employeeId },
    include: { returns: true },
  });

  const unsettled: string[] = [];
  for (const issuance of issuances) {
    if (issuance.returns.length > 0) continue; // returned (good or scrapped) - settled
    const recovery = await prisma.recoveryCalculation.findFirst({
      where: { employeeId, itemIssuanceId: issuance.id, financeVerifiedAt: { not: null } },
    });
    if (!recovery) unsettled.push(issuance.id);
  }

  if (unsettled.length > 0) {
    throw new AppError(
      409,
      "EXIT_BLOCKED_OUTSTANDING_INVENTORY",
      "Cannot complete exit: this employee has inventory that is neither returned nor recovery-settled by Finance.",
      { outstandingIssuanceIds: unsettled }
    );
  }

  const updated = await prisma.employee.update({ where: { id: employeeId }, data: { status: "exited" } });

  await prisma.employeeHistoryEvent.create({ data: { employeeId, eventType: "exited" } });

  eventBus.publish({ type: "employee.exited", organizationId, actorUserId, payload: { id: employeeId } });

  return updated;
}

/**
 * WF6 Employee Rehire: reactivates a previous employee record. Prior
 * inventory history is retained (it's never deleted, just historical rows
 * on the same employeeId), and the employee becomes newly eligible for issuance.
 */
export async function rehireEmployee(organizationId: string, employeeId: string, input: { joiningDate: string; buildingId?: string; positionId?: string }, actorUserId?: string | null) {
  const employee = await getEmployee(organizationId, employeeId);
  if (employee.status !== "exited") {
    throw new AppError(400, "NOT_EXITED", "Only a previously exited employee can be rehired.");
  }
  await assertBelongsToOrg(organizationId, { buildingId: input.buildingId, positionId: input.positionId });

  const updated = await prisma.employee.update({
    where: { id: employeeId },
    data: {
      status: "active",
      joiningDate: new Date(input.joiningDate),
      leavingDate: null,
      buildingId: input.buildingId ?? employee.buildingId,
      positionId: input.positionId ?? employee.positionId,
    },
  });

  await prisma.employeeHistoryEvent.create({ data: { employeeId, eventType: "rehired" } });

  eventBus.publish({ type: "employee.rehired", organizationId, actorUserId, payload: { id: employeeId } });

  return updated;
}
