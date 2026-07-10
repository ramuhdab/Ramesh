import crypto from "crypto";
import { prisma } from "../../lib/prisma";
import { eventBus } from "../../lib/eventBus";
import { AppError } from "../../middleware/errorHandler";
import { generateOneTimeToken } from "../../utils/tokens";
import { generateTemporaryPassword, hashPassword } from "../../utils/password";
import { env } from "../../config/env";
import { PERMISSIONS, SYSTEM_ROLES } from "../../utils/permissions";
import { sendMail } from "../notifications/mail.adapter";

/**
 * FR-1 / WF1: Organization Onboarding Workflow.
 * Super Admin creates an organization + its first Organization Admin.
 * Organization stays inactive until the admin activates via emailed link.
 * Default roles/permissions are created automatically (FR-1 business rule).
 */
export async function createOrganization(input: {
  name: string;
  subscriptionPlan?: string;
  contactInfo?: Record<string, unknown>;
  adminUsername: string;
  adminEmail: string;
  actorUserId?: string | null;
}) {
  const existing = await prisma.organization.findUnique({ where: { name: input.name } });
  if (existing) {
    throw new AppError(409, "ORGANIZATION_NAME_TAKEN", "Organization Name must be unique.");
  }

  const { token, hash } = generateOneTimeToken();
  const activationExpiresAt = new Date(Date.now() + env.tempPasswordTtlHours * 60 * 60 * 1000);

  const org = await prisma.organization.create({
    data: {
      name: input.name,
      subscriptionPlan: input.subscriptionPlan ?? "standard",
      contactInfo: input.contactInfo,
      status: "pending",
      activationTokenHash: hash,
      activationTokenExpiresAt: activationExpiresAt,
    },
  });

  await seedDefaultRolesAndPermissions(org.id);

  const tempPassword = generateTemporaryPassword();
  const admin = await prisma.user.create({
    data: {
      organizationId: org.id,
      username: input.adminUsername,
      email: input.adminEmail,
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
      tempPasswordExpiresAt: new Date(Date.now() + env.tempPasswordTtlHours * 60 * 60 * 1000),
    },
  });

  const orgAdminRole = await prisma.role.findFirstOrThrow({
    where: { organizationId: org.id, name: SYSTEM_ROLES.ORG_ADMIN },
  });
  await prisma.userRole.create({ data: { userId: admin.id, roleId: orgAdminRole.id } });

  await sendMail({
    to: admin.email,
    subject: "Activate your SPQR Inventory Management organization",
    body: `Your organization "${org.name}" has been created. Activation token: ${token} (expires in ${env.tempPasswordTtlHours}h).\nYour temporary password is: ${tempPassword} (you must change it on first login).`,
  });

  eventBus.publish({
    type: "organization.created",
    organizationId: org.id,
    actorUserId: input.actorUserId,
    payload: { id: org.id, name: org.name },
  });

  // The plaintext activation token/temp password are only ever known here
  // (only their hashes are persisted) and are normally delivered by email.
  // Returned to the caller so the route layer can decide whether to expose
  // them in the HTTP response - only done outside production, so
  // E2E/integration tests can complete the WF1 activation flow without a
  // real mailbox. See organization.routes.ts.
  return { organization: org, adminUserId: admin.id, activationToken: token, adminTempPassword: tempPassword };
}

export async function activateOrganization(organizationId: string, activationToken: string) {
  const hash = crypto.createHash("sha256").update(activationToken).digest("hex");

  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org || org.activationTokenHash !== hash) {
    throw new AppError(400, "INVALID_ACTIVATION_TOKEN", "Activation token is invalid.");
  }
  if (!org.activationTokenExpiresAt || org.activationTokenExpiresAt < new Date()) {
    throw new AppError(400, "ACTIVATION_TOKEN_EXPIRED", "Activation token has expired.");
  }

  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: { status: "active", activationTokenHash: null, activationTokenExpiresAt: null },
  });

  eventBus.publish({ type: "organization.activated", organizationId, payload: { id: organizationId } });
  return updated;
}

export async function listOrganizations() {
  return prisma.organization.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getOrganization(id: string) {
  const org = await prisma.organization.findUnique({ where: { id } });
  if (!org) throw new AppError(404, "NOT_FOUND", "Organization not found.");
  return org;
}

export async function updateOrganization(id: string, data: Partial<{ subscriptionPlan: string; status: string; logoUrl: string; contactInfo: Record<string, unknown>; businessHours: Record<string, unknown> }>) {
  await getOrganization(id);
  return prisma.organization.update({ where: { id }, data });
}

/**
 * Seeds the default, system-defined roles for a new organization (FR-1).
 * Organization Administrator gets every org-scoped permission; the other
 * operational roles are created empty and permissions are assigned by the
 * Org Admin afterward (FR-3 / WF31) - this keeps the seed generic instead of
 * guessing a customer's exact permission model for every role.
 */
async function seedDefaultRolesAndPermissions(organizationId: string) {
  const allPermissions = await ensurePermissionCatalog();
  const orgScopedPermissions = allPermissions.filter((p) => !p.module.startsWith("platform"));

  const roleNames = Object.values(SYSTEM_ROLES);
  const roles = await Promise.all(
    roleNames.map((name) =>
      prisma.role.create({ data: { organizationId, name, isSystemDefined: true } })
    )
  );

  const orgAdminRole = roles.find((r) => r.name === SYSTEM_ROLES.ORG_ADMIN)!;
  await prisma.rolePermission.createMany({
    data: orgScopedPermissions.map((p) => ({ roleId: orgAdminRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });
}

/** Idempotently ensures every permission constant exists as a row (run at boot too - see seed.ts). */
export async function ensurePermissionCatalog() {
  // Our permission strings are "module:action" (2 parts) - see utils/permissions.ts.
  // The schema also supports an optional "screen" segment for finer-grained
  // future permissions ("module:screen:action"), defaulted to "" until needed.
  const entries = Object.values(PERMISSIONS).map((value) => {
    const parts = value.split(":");
    const [module, second, third] = parts;
    const screen = parts.length === 3 ? second : "";
    const action = parts.length === 3 ? third : second;
    return { module, screen, action };
  });

  const results = [];
  for (const entry of entries) {
    const perm = await prisma.permission.upsert({
      where: { module_screen_action: { module: entry.module, screen: entry.screen, action: entry.action } },
      update: {},
      create: { module: entry.module, screen: entry.screen, action: entry.action },
    });
    results.push(perm);
  }
  return results;
}
