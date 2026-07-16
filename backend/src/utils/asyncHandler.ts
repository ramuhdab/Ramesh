import { Request, Response, NextFunction, RequestHandler } from "express";

/** Wraps an async route handler so rejected promises reach errorHandler. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
