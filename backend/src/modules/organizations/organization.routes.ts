import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission, requireSuperAdmin } from "../../middleware/requirePermission";
import { asyncHandler } from "../../utils/asyncHandler";
import { PERMISSIONS } from "../../utils/permissions";
import { env } from "../../config/env";
import * as organizationService from "./organization.service";

export const organizationRouter = Router();

const createOrgSchema = z.object({
  name: z.string().min(2),
  subscriptionPlan: z.string().optional(),
  contactInfo: z.record(z.unknown()).optional(),
  adminUsername: z.string().min(3),
  adminEmail: z.string().email(),
});

// POST /api/v1/organizations - Super Admin onboards a new organization (WF1).
organizationRouter.post(
  "/",
  authenticate,
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const input = createOrgSchema.parse(req.body);
    const result = await organizationService.createOrganization({ ...input, actorUserId: req.user!.sub });

    // The plaintext activation token/temp password are normally emailed
    // (see the console mail adapter in dev) and never persisted anywhere -
    // only their hashes are stored. Outside production, echo them back in
    // the response so local development and automated (e.g. Playwright)
    // tests can complete the WF1 activation flow without a real mailbox.
    // This branch is dead in production (env.nodeEnv === "production").
    const { activationToken, adminTempPassword, ...safeResult } = result;
    if (env.nodeEnv === "production") {
      return res.status(201).json({ data: safeResult });
    }
    res.status(201).json({ data: { ...safeResult, activationToken, adminTempPassword } });
  })
);

// POST /api/v1/organizations/:id/activate - public (activation token in body), completes WF1.
organizationRouter.post(
  "/:id/activate",
  asyncHandler(async (req, res) => {
    const schema = z.object({ token: z.string() });
    const { token } = schema.parse(req.body);
    const org = await organizationService.activateOrganization(req.params.id, token);
    res.json({ data: org });
  })
);

organizationRouter.get(
  "/",
  authenticate,
  requirePermission(PERMISSIONS.PLATFORM_ORG_VIEW),
  asyncHandler(async (_req, res) => {
    const orgs = await organizationService.listOrganizations();
    res.json({ data: orgs, meta: { count: orgs.length } });
  })
);

organizationRouter.get(
  "/:id",
  authenticate,
  asyncHandler(async (req, res) => {
    // Super Admin can view any org; an org's own users can view their own org only.
    if (!req.user!.isSuperAdmin && req.user!.organizationId !== req.params.id) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Cannot view another organization." } });
    }
    const org = await organizationService.getOrganization(req.params.id);
    res.json({ data: org });
  })
);

organizationRouter.patch(
  "/:id",
  authenticate,
  requirePermission(PERMISSIONS.PLATFORM_ORG_UPDATE),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      subscriptionPlan: z.string().optional(),
      status: z.enum(["pending", "active", "suspended"]).optional(),
      logoUrl: z.string().url().optional(),
      contactInfo: z.record(z.unknown()).optional(),
      businessHours: z.record(z.unknown()).optional(),
    });
    const data = schema.parse(req.body);
    const org = await organizationService.updateOrganization(req.params.id, data);
    res.json({ data: org });
  })
);
