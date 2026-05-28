import type { Request, Response, NextFunction, RequestHandler } from "express";

// PUBLIC_INTERFACE
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  /**
   * Wraps an async route handler and forwards errors to Express error middleware.
   */
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
