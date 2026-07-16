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

  // Both username and email are globally unique on User (not per-organization
  // - see schema.prisma), and none of the writes below run inside a
  // transaction. Checking here first, before anything is written, avoids a
  // partial failure that would otherwise leave an orphaned Organization (and
  // its seeded roles) behind with no admin user if prisma.user.create() hit
  // this same constraint mid-flow.
  const [usernameTaken, emailTaken] = await Promise.all([
    prisma.user.findUnique({ where: { username: input.adminUsername } }),
    prisma.user.findUnique({ where: { email: input.adminEmail } }),
  ]);
  if (usernameTaken) {
    throw new AppError(409, "ADMIN_USERNAME_TAKEN", "That admin username is already in use by another user.");
  }
  if (emailTaken) {
    throw new AppError(409, "ADMIN_EMAIL_TAKEN", "That admin email is already in use by another user.");
  }

  const { token, hash } = generateOneTimeToken();
  const activationExpiresAt = new Date(Date.now() + env.tempPasswordTtlHours * 60 * 60 * 1000);

  const org = await prisma.organization.create({
    data: {
      name: input.name,
      subscriptionPlan: input.subscriptionPlan ?? "standard",
      contactInfo: input.contactInfo as any,
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

/**
 * Super-Admin-initiated activation, skipping the token check entirely.
 * The token exists to prove whoever clicks "activate" actually received the
 * admin's invite email - meaningful when a real mail provider is configured
 * (see 06/07's AWS/Azure SES/ACS setup), but this deployment uses the
 * console mail adapter (no real email is ever sent - see mail.adapter.ts),
 * so a Super Admin who just created the organization themselves is already
 * provably authorized; making them hunt down the token from logs just to
 * activate their own just-created org added friction with no real security
 * benefit on this deployment. Gated to requireSuperAdmin at the route layer.
 */
export async function activateOrganizationBySuperAdmin(organizationId: string) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) throw new AppError(404, "NOT_FOUND", "Organization not found.");

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
  return prisma.organization.update({ where: { id }, data: data as any });
}

/**
 * Seeds the default, system-defined roles for a new organization (FR-1).
 * Organization Administrator gets every org-scoped permission; the other
 * operational roles are created empty and permissions are assigned by the
 * Org Admin afterward (FR-3 / WF31) - this keeps the seed generic instead of
 * guessing a customer's exact permission model for every role.
 */
export async function seedDefaultRolesAndPermissions(organizationId: string) {
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
