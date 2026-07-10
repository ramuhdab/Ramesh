import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import multer from "multer";
import { logger } from "../lib/logger";

export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Standard response envelope (05-API-Specification.md, "Conventions").
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Request validation failed.", details: err.flatten() },
    });
  }
  // File uploads (Attachments/Import - see attachment.routes.ts,
  // dataio.routes.ts) both cap size via multer's `limits.fileSize`; without
  // this branch an oversized (or otherwise malformed) upload surfaces as a
  // generic 500 instead of a clear 400 (flagged in code review).
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: { code: err.code, message: err.message } });
  }
  logger.error("Unhandled error", { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined, path: req.path });
  return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } });
}
