import jwt, { type Secret, type SignOptions } from "jsonwebtoken";
import { config } from "../config/env.js";
import type { AuthUser, JwtClaims } from "@smartoutage/shared";

/**
 * Internal (non-exported) base claims for access tokens.
 */
type AccessTokenClaims = Omit<JwtClaims, "iat" | "exp">;

/**
 * Refresh token claims are minimal; they must include `sub` and a token id (`jti`) for revocation.
 */
export type RefreshTokenClaims = {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  iss?: string;
  aud?: string;
};

// PUBLIC_INTERFACE
export function signAccessToken(user: AuthUser): string {
  /**
   * Signs an access JWT for the given user, embedding role/email in the payload.
   * This token is used for Authorization: Bearer on protected endpoints.
   */
  const payload: AccessTokenClaims = { sub: user.id, email: user.email, role: user.role };
  return jwt.sign(payload, config.jwt.secret as Secret, {
    expiresIn: config.jwt.expiresIn as SignOptions["expiresIn"],
    issuer: config.jwt.issuer || undefined,
    audience: config.jwt.audience || undefined
  });
}

// PUBLIC_INTERFACE
export function verifyAccessToken(token: string): JwtClaims {
  /**
   * Verifies and decodes an access token. Throws if invalid/expired.
   */
  return jwt.verify(token, config.jwt.secret, {
    issuer: config.jwt.issuer || undefined,
    audience: config.jwt.audience || undefined
  }) as JwtClaims;
}

// PUBLIC_INTERFACE
export function signRefreshToken(userId: string, jti: string): string {
  /**
   * Signs a refresh JWT containing the user id (sub) and refresh id (jti).
   * This token is exchanged for a new access token via /api/auth/refresh.
   */
  const payload = { sub: userId, jti };
  return jwt.sign(payload, config.refreshJwt.secret as Secret, {
    expiresIn: config.refreshJwt.expiresIn as SignOptions["expiresIn"],
    issuer: config.jwt.issuer || undefined,
    audience: config.jwt.audience || undefined
  });
}

// PUBLIC_INTERFACE
export function verifyRefreshToken(token: string): RefreshTokenClaims {
  /**
   * Verifies and decodes a refresh token. Throws if invalid/expired.
   */
  return jwt.verify(token, config.refreshJwt.secret, {
    issuer: config.jwt.issuer || undefined,
    audience: config.jwt.audience || undefined
  }) as RefreshTokenClaims;
}
