import { prisma } from "../../lib/prisma";
import { eventBus } from "../../lib/eventBus";
import { AppError } from "../../middleware/errorHandler";
import { env } from "../../config/env";
import { generateTemporaryPassword, hashPassword } from "../../utils/password";
import { sendMail } from "../notifications/mail.adapter";

/**
 * WF2 User Registration Workflow.
 * Business rules (BRD FR-2): username/email unique platform-wide (see
 * 03-Data-Model.md note on the global-uniqueness decision), temp password
 * expires in 24h, user must change password on first login.
 */
export async function createUser(input: {
  organizationId: string;
  username: string;
  email: string;
  roleIds: string[];
  actorUserId?: string | null;
}) {
  const [existingUsername, existingEmail] = await Promise.all([
    prisma.user.findUnique({ where: { username: input.username } }),
    prisma.user.findUnique({ where: { email: input.email } }),
  ]);
  if (existingUsername) throw new AppError(409, "USERNAME_TAKEN", "Username must be unique.");
  if (existingEmail) throw new AppError(409, "EMAIL_TAKEN", "Email must be unique.");

  if (input.roleIds.length === 0) {
    throw new AppError(400, "ROLE_REQUIRED", "Every user must be assigned at least one role.");
  }
  const roles = await prisma.role.findMany({ where: { id: { in: input.roleIds }, organizationId: input.organizationId } });
  if (roles.length !== input.roleIds.length) {
    throw new AppError(400, "INVALID_ROLE", "One or more roles do not belong to this organization.");
  }

  const tempPassword = generateTemporaryPassword();
  const user = await prisma.user.create({
    data: {
      organizationId: input.organizationId,
      username: input.username,
      email: input.email,
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
      tempPasswordExpiresAt: new Date(Date.now() + env.tempPasswordTtlHours * 60 * 60 * 1000),
      roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
    },
    include: { roles: { include: { role: true } } },
  });

  await sendMail({
    to: user.email,
    subject: "Your SPQR Inventory Management account",
    body: `Username: ${user.username}\nTemporary password: ${tempPassword} (expires in ${env.tempPasswordTtlHours}h, must be changed on first login).`,
  });

  eventBus.publish({
    type: "user.created",
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    payload: { id: user.id, email: user.email, username: user.username },
  });

  // Same rationale as organization.service.ts createOrganization: the
  // plaintext temp password is only known here (only its hash is
  // persisted); returned so the route layer can echo it back outside
  // production for local dev / automated test convenience.
  return { ...user, tempPassword };
}

export async function listUsers(organizationId: string) {
  return prisma.user.findMany({
    where: { organizationId },
    include: { roles: { include: { role: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getUser(organizationId: string, id: string) {
  const user = await prisma.user.findFirst({
    where: { id, organizationId },
    include: { roles: { include: { role: true } } },
  });
  if (!user) throw new AppError(404, "NOT_FOUND", "User not found.");
  return user;
}

export async function updateUser(
  organizationId: string,
  id: string,
  data: Partial<{ isActive: boolean; lockedUntil: Date | null; failedLoginCount: number }>
) {
  await getUser(organizationId, id);
  return prisma.user.update({ where: { id }, data });
}

export async function assignRoles(organizationId: string, userId: string, roleIds: string[], actorUserId?: string | null) {
  await getUser(organizationId, userId);
  if (roleIds.length === 0) throw new AppError(400, "ROLE_REQUIRED", "A user must have at least one role.");

  const roles = await prisma.role.findMany({ where: { id: { in: roleIds }, organizationId } });
  if (roles.length !== roleIds.length) throw new AppError(400, "INVALID_ROLE", "One or more roles do not belong to this organization.");

  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId } }),
    prisma.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId })) }),
  ]);

  eventBus.publish({
    type: "user.role_assigned",
    organizationId,
    actorUserId,
    payload: { id: userId, roleIds },
  });

  return getUser(organizationId, userId);
}
