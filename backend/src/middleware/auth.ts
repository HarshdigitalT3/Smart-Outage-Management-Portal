import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import type { JwtClaims, AuthUser } from "@smartoutage/shared";

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
    const decoded = jwt.verify(token, config.jwt.secret, {
      issuer: config.jwt.issuer || undefined,
      audience: config.jwt.audience || undefined
    }) as JwtClaims;

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
