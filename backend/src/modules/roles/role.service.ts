import { prisma } from "../../lib/prisma";
import { eventBus } from "../../lib/eventBus";
import { AppError } from "../../middleware/errorHandler";

/**
 * FR-3/FR-4 Role & Permission Assignment (RBAC), WF31/WF29.
 * Business rules:
 *  - role name unique within the organization
 *  - system-defined roles cannot be deleted
 *  - Organization Administrators cannot modify Super Administrator permissions
 *    (enforced by scoping every query here to organizationId - platform
 *    roles have organizationId = null and are simply invisible to this API)
 */

export async function createRole(organizationId: string, name: string) {
  const existing = await prisma.role.findFirst({ where: { organizationId, name } });
  if (existing) throw new AppError(409, "ROLE_NAME_TAKEN", "Role Name must be unique within the organization.");
  return prisma.role.create({ data: { organizationId, name } });
}

export async function listRoles(organizationId: string) {
  return prisma.role.findMany({
    where: { organizationId },
    include: { permissions: { include: { permission: true } } },
    orderBy: { name: "asc" },
  });
}

export async function assignPermissions(organizationId: string, roleId: string, permissionIds: string[]) {
  const role = await prisma.role.findFirst({ where: { id: roleId, organizationId } });
  if (!role) throw new AppError(404, "NOT_FOUND", "Role not found.");

  const uniqueIds = Array.from(new Set(permissionIds));
  if (uniqueIds.length !== permissionIds.length) {
    throw new AppError(400, "DUPLICATE_PERMISSION", "Duplicate permission assignments are not allowed.");
  }

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({ data: uniqueIds.map((permissionId) => ({ roleId, permissionId })) }),
  ]);

  eventBus.publish({ type: "role.permissions_updated", organizationId, payload: { id: roleId } });

  return prisma.role.findUnique({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
}

export async function deleteRole(organizationId: string, roleId: string) {
  const role = await prisma.role.findFirst({ where: { id: roleId, organizationId } });
  if (!role) throw new AppError(404, "NOT_FOUND", "Role not found.");
  if (role.isSystemDefined) {
    throw new AppError(400, "SYSTEM_ROLE_UNDELETABLE", "System-defined roles cannot be deleted.");
  }
  const assigned = await prisma.userRole.count({ where: { roleId } });
  if (assigned > 0) {
    throw new AppError(409, "ROLE_IN_USE", "This role is assigned to users and cannot be deleted.");
  }
  await prisma.role.delete({ where: { id: roleId } });
}

export async function listPermissionCatalog() {
  return prisma.permission.findMany({ orderBy: [{ module: "asc" }, { action: "asc" }] });
}
