import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { asyncHandler } from "../../utils/asyncHandler";
import { PERMISSIONS } from "../../utils/permissions";
import { AppError } from "../../middleware/errorHandler";
import * as roleService from "./role.service";

export const roleRouter = Router();
roleRouter.use(authenticate);

function requireOrg(req: any): string {
  const orgId = req.user?.organizationId;
  if (!orgId) throw new AppError(400, "NO_ORGANIZATION_CONTEXT", "This action requires an organization context.");
  return orgId;
}

roleRouter.post(
  "/",
  requirePermission(PERMISSIONS.IDENTITY_ROLE_CREATE),
  asyncHandler(async (req, res) => {
    const { name } = z.object({ name: z.string().min(2) }).parse(req.body);
    const role = await roleService.createRole(requireOrg(req), name);
    res.status(201).json({ data: role });
  })
);

roleRouter.get(
  "/",
  requirePermission(PERMISSIONS.IDENTITY_ROLE_VIEW),
  asyncHandler(async (req, res) => {
    const roles = await roleService.listRoles(requireOrg(req));
    res.json({ data: roles, meta: { count: roles.length } });
  })
);

roleRouter.get(
  "/permissions/catalog",
  requirePermission(PERMISSIONS.IDENTITY_ROLE_VIEW),
  asyncHandler(async (_req, res) => {
    const permissions = await roleService.listPermissionCatalog();
    res.json({ data: permissions });
  })
);

roleRouter.patch(
  "/:id/permissions",
  requirePermission(PERMISSIONS.IDENTITY_ROLE_UPDATE),
  asyncHandler(async (req, res) => {
    const { permissionIds } = z.object({ permissionIds: z.array(z.string()) }).parse(req.body);
    const role = await roleService.assignPermissions(requireOrg(req), req.params.id, permissionIds);
    res.json({ data: role });
  })
);

roleRouter.delete(
  "/:id",
  requirePermission(PERMISSIONS.IDENTITY_ROLE_UPDATE),
  asyncHandler(async (req, res) => {
    await roleService.deleteRole(requireOrg(req), req.params.id);
    res.status(204).send();
  })
);
