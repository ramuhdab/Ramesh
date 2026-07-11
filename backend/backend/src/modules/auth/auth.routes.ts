import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { asyncHandler } from "../../utils/asyncHandler";
import * as authService from "./auth.service";

export const authRouter = Router();

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const schema = z.object({ username: z.string(), password: z.string() });
    const { username, password } = schema.parse(req.body);
    const result = await authService.login({ username, password, ip: req.ip, userAgent: req.headers["user-agent"] });
    res.json({ data: result });
  })
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const schema = z.object({ refreshToken: z.string() });
    const { refreshToken } = schema.parse(req.body);
    const result = await authService.refreshAccessToken(refreshToken);
    res.json({ data: result });
  })
);

authRouter.post(
  "/logout",
  authenticate,
  asyncHandler(async (req, res) => {
    await authService.logout(req.user!.sub);
    res.json({ data: { success: true } });
  })
);

authRouter.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const schema = z.object({ email: z.string().email() });
    const { email } = schema.parse(req.body);
    await authService.forgotPassword(email);
    // Always return success to avoid leaking which emails are registered.
    res.json({ data: { message: "If that email is registered, a reset link has been sent." } });
  })
);

authRouter.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const schema = z.object({ email: z.string().email(), token: z.string(), newPassword: z.string() });
    const input = schema.parse(req.body);
    await authService.resetPassword(input);
    res.json({ data: { message: "Password updated successfully." } });
  })
);

authRouter.post(
  "/change-password",
  authenticate,
  asyncHandler(async (req, res) => {
    const schema = z.object({ currentPassword: z.string(), newPassword: z.string() });
    const { currentPassword, newPassword } = schema.parse(req.body);
    await authService.changePassword(req.user!.sub, currentPassword, newPassword);
    res.json({ data: { message: "Password changed successfully." } });
  })
);

// WF33: re-authentication gate before sensitive actions (User Admin, Role
// Management, Procurement Approval, Organization Configuration). The
// frontend calls this immediately before such an action and attaches the
// short-lived "reauth" confirmation; enforcement of *which* routes require
// it lives in requireReauth middleware (see middleware/requireReauth.ts).
authRouter.post(
  "/reauth",
  authenticate,
  asyncHandler(async (req, res) => {
    const schema = z.object({ password: z.string() });
    const { password } = schema.parse(req.body);
    const ok = await authService.reauthenticate(req.user!.sub, password, req.user!.isSuperAdmin);
    if (!ok) {
      return res.status(401).json({ error: { code: "REAUTH_FAILED", message: "Password incorrect." } });
    }
    res.json({ data: { reauthenticated: true } });
  })
);
