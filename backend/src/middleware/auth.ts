import type { RequestHandler } from "express";
import type { JwtClaims, AuthUser } from "@smartoutage/shared";
import { verifyAccessToken } from "../utils/jwt.js";

// PUBLIC_INTERFACE
export const requireAuth: RequestHandler = (req, _res, next) => {
  /**
   * Requires a valid Bearer JWT. On success, attaches `req.user`.
   */
  const header = req.header("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    const err = new Error("Missing Authorization header");
    // @ts-expect-error attach status
    err.status = 401;
    throw err;
  }

  const token = header.slice("bearer ".length).trim();
  try {
    const decoded = verifyAccessToken(token) as JwtClaims;

    const user: AuthUser = { id: decoded.sub, email: decoded.email, role: decoded.role };
    req.user = user;
    next();
  } catch {
    const err = new Error("Invalid or expired token");
    // @ts-expect-error attach status
    err.status = 401;
    throw err;
  }
};
