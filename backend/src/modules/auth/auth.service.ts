import { prisma } from "../../lib/prisma";
import { eventBus } from "../../lib/eventBus";
import { AppError } from "../../middleware/errorHandler";
import { env } from "../../config/env";
import {
  comparePassword,
  hashPassword,
  isPasswordReused,
  validatePasswordPolicy,
} from "../../utils/password";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  generateOneTimeToken,
  hashOneTimeToken,
} from "../../utils/tokens";
import { sendMail } from "../notifications/mail.adapter";

/**
 * WF32 Authentication & Password Reset Workflow, WF33 Session Timeout.
 * Business rules implemented here (BRD FR-5/FR-6):
 *  - account locks after MAX_FAILED_LOGIN_ATTEMPTS consecutive failures
 *  - passwords are bcrypt-hashed, never stored/compared in plaintext
 *  - reset links expire after PASSWORD_RESET_TOKEN_TTL_MINUTES
 *  - last 5 passwords cannot be reused
 *  - temporary/first-login passwords must be changed before use continues
 */

async function loadRolesAndPermissions(userId: string) {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });

  const roles = userRoles.map((ur) => ur.role.name);
  const permissionSet = new Set<string>();
  for (const ur of userRoles) {
    for (const rp of ur.role.permissions) {
      const p = rp.permission;
      permissionSet.add(p.screen ? `${p.module}:${p.screen}:${p.action}` : `${p.module}:${p.action}`);
    }
  }
  return { roles, permissions: Array.from(permissionSet) };
}

export async function login(input: { username: string; password: string; ip?: string; userAgent?: string }) {
  // Sparquer Super Administrators are a separate, platform-level identity
  // (they sit above every organization - see 02-Architecture.md, Section 3).
  const superAdmin = await prisma.superAdmin.findFirst({ where: { username: input.username, isActive: true } });
  if (superAdmin) return loginSuperAdmin(superAdmin, input);

  const user = await prisma.user.findFirst({
    where: { username: input.username, isActive: true },
    include: { organization: true },
  });

  if (!user) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid username or password.");
  }

  // BRD FR-1 / WF1: an organization stays inactive until its admin activates
  // it, and a suspended organization must not allow any further access.
  if (user.organization.status !== "active") {
    throw new AppError(
      403,
      "ORGANIZATION_NOT_ACTIVE",
      user.organization.status === "pending"
        ? "This organization has not been activated yet. Check the activation email sent to your administrator."
        : "This organization's access has been suspended. Contact Sparquer support."
    );
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(423, "ACCOUNT_LOCKED", "Account is locked due to too many failed login attempts. Contact your administrator.");
  }

  const valid = await comparePassword(input.password, user.passwordHash);
  if (!valid) {
    const failedCount = user.failedLoginCount + 1;
    const lockedUntil = failedCount >= env.maxFailedLoginAttempts ? new Date(Date.now() + 30 * 60 * 1000) : null;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: failedCount, lockedUntil },
    });
    eventBus.publish({
      type: lockedUntil ? "auth.account_locked" : "auth.login_failed",
      organizationId: user.organizationId,
      actorUserId: user.id,
      payload: { username: user.username },
    });
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid username or password.");
  }

  if (user.tempPasswordExpiresAt && user.tempPasswordExpiresAt < new Date() && user.mustChangePassword) {
    throw new AppError(401, "TEMP_PASSWORD_EXPIRED", "Temporary password has expired. Request a new one from your administrator.");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const { roles, permissions } = await loadRolesAndPermissions(user.id);
  const accessToken = signAccessToken({
    sub: user.id,
    organizationId: user.organizationId,
    isSuperAdmin: false,
    roles,
    permissions,
  });
  const refreshToken = signRefreshToken(user.id);

  await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashOneTimeToken(refreshToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ip: input.ip,
      userAgent: input.userAgent,
    },
  });

  return {
    accessToken,
    refreshToken,
    mustChangePassword: user.mustChangePassword,
    user: { id: user.id, username: user.username, email: user.email, organizationId: user.organizationId, roles },
  };
}

async function loginSuperAdmin(
  superAdmin: { id: string; passwordHash: string; lockedUntil: Date | null; failedLoginCount: number; username: string; mustChangePassword: boolean },
  input: { password: string; ip?: string; userAgent?: string }
) {
  if (superAdmin.lockedUntil && superAdmin.lockedUntil > new Date()) {
    throw new AppError(423, "ACCOUNT_LOCKED", "Account is locked due to too many failed login attempts.");
  }

  const valid = await comparePassword(input.password, superAdmin.passwordHash);
  if (!valid) {
    const failedCount = superAdmin.failedLoginCount + 1;
    const lockedUntil = failedCount >= env.maxFailedLoginAttempts ? new Date(Date.now() + 30 * 60 * 1000) : null;
    await prisma.superAdmin.update({ where: { id: superAdmin.id }, data: { failedLoginCount: failedCount, lockedUntil } });
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid username or password.");
  }

  await prisma.superAdmin.update({ where: { id: superAdmin.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });

  const accessToken = signAccessToken({
    sub: superAdmin.id,
    organizationId: null,
    isSuperAdmin: true,
    roles: ["Sparquer Super Administrator"],
    permissions: [],
  });
  const refreshToken = signRefreshToken(superAdmin.id);

  return {
    accessToken,
    refreshToken,
    mustChangePassword: superAdmin.mustChangePassword,
    user: { id: superAdmin.id, username: superAdmin.username, email: null, organizationId: null, roles: ["Sparquer Super Administrator"] },
  };
}

export async function refreshAccessToken(refreshToken: string) {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, "INVALID_TOKEN", "Refresh token is invalid or expired. Please log in again.");
  }

  const superAdmin = await prisma.superAdmin.findUnique({ where: { id: decoded.sub } });
  if (superAdmin && superAdmin.isActive) {
    const accessToken = signAccessToken({
      sub: superAdmin.id,
      organizationId: null,
      isSuperAdmin: true,
      roles: ["Sparquer Super Administrator"],
      permissions: [],
    });
    return { accessToken };
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.sub }, include: { organization: true } });
  if (!user || !user.isActive) throw new AppError(401, "INVALID_TOKEN", "Session no longer valid.");
  if (user.organization.status !== "active") {
    throw new AppError(403, "ORGANIZATION_NOT_ACTIVE", "This organization no longer has active access.");
  }

  const { roles, permissions } = await loadRolesAndPermissions(user.id);
  const accessToken = signAccessToken({
    sub: user.id,
    organizationId: user.organizationId,
    isSuperAdmin: false,
    roles,
    permissions,
  });
  return { accessToken };
}

export async function logout(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}

/**
 * WF33: re-authentication gate for sensitive actions (User Administration,
 * Role Management, Procurement Approval, Organization Configuration).
 * Verifies the *current* password without issuing a new session/token.
 */
export async function reauthenticate(userId: string, password: string, isSuperAdmin: boolean): Promise<boolean> {
  if (isSuperAdmin) {
    const admin = await prisma.superAdmin.findUnique({ where: { id: userId } });
    if (!admin) return false;
    return comparePassword(password, admin.passwordHash);
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  return comparePassword(password, user.passwordHash);
}

export async function forgotPassword(email: string) {
  const user = await prisma.user.findFirst({ where: { email } });
  // Do not reveal whether the email exists - respond the same either way.
  if (!user) return;

  const { token, hash } = generateOneTimeToken();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetTokenHash: hash,
      resetTokenExpiresAt: new Date(Date.now() + env.passwordResetTokenTtlMinutes * 60 * 1000),
    },
  });

  await sendMail({
    to: user.email,
    subject: "Reset your SPQR Inventory Management password",
    body: `Use this token to reset your password (expires in ${env.passwordResetTokenTtlMinutes} minutes): ${token}`,
  });
}

export async function resetPassword(input: { email: string; token: string; newPassword: string }) {
  const user = await prisma.user.findFirst({ where: { email: input.email } });
  const hash = hashOneTimeToken(input.token);
  if (!user || user.resetTokenHash !== hash) {
    throw new AppError(400, "INVALID_RESET_TOKEN", "Reset token is invalid.");
  }
  if (!user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    throw new AppError(400, "RESET_TOKEN_EXPIRED", "Reset link has expired. Please request a new one.");
  }

  await applyNewPassword(user.id, input.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { resetTokenHash: null, resetTokenExpiresAt: null } });

  eventBus.publish({ type: "auth.password_reset", organizationId: user.organizationId, actorUserId: user.id });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) throw new AppError(401, "INVALID_CREDENTIALS", "Current password is incorrect.");

  await applyNewPassword(userId, newPassword);
}

async function applyNewPassword(userId: string, newPassword: string) {
  const policy = validatePasswordPolicy(newPassword);
  if (!policy.valid) {
    throw new AppError(400, "PASSWORD_POLICY_VIOLATION", "Password does not meet policy requirements.", policy.errors);
  }

  const history = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { changedAt: "desc" },
    take: 5,
  });
  const reused = await isPasswordReused(newPassword, history.map((h) => h.passwordHash));
  if (reused) {
    throw new AppError(400, "PASSWORD_REUSE_NOT_ALLOWED", "You cannot reuse any of your last 5 passwords.");
  }

  const newHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash, mustChangePassword: false, tempPasswordExpiresAt: null } }),
    prisma.passwordHistory.create({ data: { userId, passwordHash: newHash } }),
  ]);
}
