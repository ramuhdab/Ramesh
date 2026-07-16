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

    // The plaintext activation token/temp password are normally emailed and
    // never persisted anywhere - only their hashes are stored. Hiding them
    // from this response in production only makes sense when a real mail
    // provider (SES/ACS) is actually configured to deliver them somewhere -
    // see 06/07's AWS/Azure guides. With MAIL_PROVIDER=console (this
    // deployment), no real email is EVER sent (see mail.adapter.ts), so
    // hiding them here would make them unrecoverable without digging
    // through platform logs. Echo them back whenever there's no real mail
    // provider to deliver them instead.
    const { activationToken, adminTempPassword, ...safeResult } = result;
    const realEmailWillBeSent = env.nodeEnv === "production" && env.mailProvider !== "console";
    if (realEmailWillBeSent) {
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

// POST /api/v1/organizations/:id/activate-now - Super Admin bypass, no token
// required. See activateOrganizationBySuperAdmin() for why this is safe: the
// caller is already authenticated as the Super Admin who (in the normal
// case) just created this same organization, so there's nothing left to
// prove by round-tripping a token through email/console logs.
organizationRouter.post(
  "/:id/activate-now",
  authenticate,
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const org = await organizationService.activateOrganizationBySuperAdmin(req.params.id);
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
