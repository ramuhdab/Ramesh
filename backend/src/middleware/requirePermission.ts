import { Request, Response, NextFunction } from "express";

/**
 * Server-side RBAC enforcement (BRD FR-3 / WF31). This is the ONLY place
 * permission decisions are made - the frontend hiding a button is a
 * convenience, never the security boundary (see 02-Architecture.md, Section 5).
 *
 * Sparquer Super Admins bypass organization-scoped permission checks
 * entirely (they operate at the platform level), but Organization
 * Administrators can never be granted Super Admin permissions (FR-3).
 */
export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Not authenticated." } });
    }
    if (user.isSuperAdmin) return next();

    const granted = new Set(user.permissions);
    const hasAll = permissions.every((p) => granted.has(p));
    if (!hasAll) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission to perform this action.",
          details: { required: permissions },
        },
      });
    }
    next();
  };
}

/** Requires the caller to be the platform-level Sparquer Super Administrator. */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isSuperAdmin) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: "Super Administrator access required." } });
  }
  next();
}
