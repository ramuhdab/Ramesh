import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../utils/asyncHandler";
import { PERMISSIONS } from "../../utils/permissions";
import { AppError } from "../../middleware/errorHandler";
import { env } from "../../config/env";
import * as userService from "./user.service";

export const userRouter = Router();
userRouter.use(authenticate);

function requireOrg(req: any): string {
  const orgId = req.user?.organizationId;
  if (!orgId) throw new AppError(400, "NO_ORGANIZATION_CONTEXT", "This action requires an organization context.");
  return orgId;
}

userRouter.post(
  "/",
  requirePermission(PERMISSIONS.IDENTITY_USER_CREATE),
  asyncHandler(async (req, res) => {
    const schema = z.object({ username: z.string().min(3), email: z.string().email(), roleIds: z.array(z.string()).min(1) });
    const input = schema.parse(req.body);
    const orgId = requireOrg(req);
    const user = await userService.createUser({ ...input, organizationId: orgId, actorUserId: req.user!.sub });

    // Same non-production convenience as organizations - see organization.routes.ts.
    const { tempPassword, ...safeUser } = user;
    if (env.nodeEnv === "production") {
      return res.status(201).json({ data: safeUser });
    }
    res.status(201).json({ data: { ...safeUser, tempPassword } });
  })
);

userRouter.get(
  "/",
  requirePermission(PERMISSIONS.IDENTITY_USER_VIEW),
  asyncHandler(async (req, res) => {
    const orgId = requireOrg(req);
    const users = await userService.listUsers(orgId);
    res.json({ data: users, meta: { count: users.length } });
  })
);

userRouter.get(
  "/:id",
  requirePermission(PERMISSIONS.IDENTITY_USER_VIEW),
  asyncHandler(async (req, res) => {
    const orgId = requireOrg(req);
    const user = await userService.getUser(orgId, req.params.id);
    res.json({ data: user });
  })
);

userRouter.patch(
  "/:id",
  requirePermission(PERMISSIONS.IDENTITY_USER_UPDATE),
  asyncHandler(async (req, res) => {
    const schema = z.object({ isActive: z.boolean().optional(), lockedUntil: z.string().datetime().nullable().optional() });
    const data = schema.parse(req.body);
    const orgId = requireOrg(req);
    const user = await userService.updateUser(orgId, req.params.id, {
      ...data,
      lockedUntil: data.lockedUntil ? new Date(data.lockedUntil) : data.lockedUntil,
    });
    res.json({ data: user });
  })
);

userRouter.post(
  "/:id/roles",
  requirePermission(PERMISSIONS.IDENTITY_ROLE_UPDATE),
  asyncHandler(async (req, res) => {
    const schema = z.object({ roleIds: z.array(z.string()).min(1) });
    const { roleIds } = schema.parse(req.body);
    const orgId = requireOrg(req);
    const user = await userService.assignRoles(orgId, req.params.id, roleIds, req.user!.sub);
    res.json({ data: user });
  })
);
