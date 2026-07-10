import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { asyncHandler } from "../../utils/asyncHandler";
import { listUserNotifications, markNotificationRead } from "./notification.service";

export const notificationRouter = Router();
notificationRouter.use(authenticate);

// GET /api/v1/notifications - own notifications (bell), per 05-API-Specification.md Section 10.
notificationRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const orgId = req.user!.organizationId;
    if (!orgId) return res.json({ data: [], meta: {} });
    const notifications = await listUserNotifications(orgId, req.user!.sub);
    res.json({ data: notifications, meta: { count: notifications.length } });
  })
);

notificationRouter.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const orgId = req.user!.organizationId;
    if (!orgId) return res.status(400).json({ error: { code: "NO_ORGANIZATION_CONTEXT", message: "This action requires an organization context." } });
    const updated = await markNotificationRead(orgId, req.user!.sub, req.params.id);
    res.json({ data: updated });
  })
);
