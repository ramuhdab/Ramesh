import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../config/env";

export type AccessTokenPayload = {
  sub: string; // user id
  organizationId: string | null; // null for platform Super Admin
  isSuperAdmin: boolean;
  roles: string[];
  permissions: string[];
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtAccessExpiresIn });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpiresIn });
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, env.jwtRefreshSecret) as { sub: string };
}

/** One-time tokens for password reset / email activation links (FR-5, WF1). */
export function generateOneTimeToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

export function hashOneTimeToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
