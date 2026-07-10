import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/tokens";

/**
 * Verifies the bearer JWT and attaches the decoded payload to req.user.
 * Per BRD FR-6 (session timeout / WF33): an expired or invalid token is
 * always rejected here, before any route logic runs.
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Missing or invalid Authorization header." } });
  }

  const token = header.slice("Bearer ".length);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Session expired or token invalid. Please log in again." } });
  }
}
