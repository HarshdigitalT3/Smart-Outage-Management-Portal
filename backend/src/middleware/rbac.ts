import type { RequestHandler } from "express";
import type { Role } from "@smartoutage/shared";

// PUBLIC_INTERFACE
export function requireRole(...allowed: Role[]): RequestHandler {
  /**
   * Requires an authenticated user with one of the allowed roles.
   * Must be used after `requireAuth`.
   */
  return (req, _res, next) => {
    const role = req.user?.role;
    if (!role) {
      const err = new Error("Not authenticated");
      // @ts-expect-error attach status
      err.status = 401;
      throw err;
    }
    if (!allowed.includes(role)) {
      const err = new Error("Forbidden");
      // @ts-expect-error attach status
      err.status = 403;
      throw err;
    }
    next();
  };
}
