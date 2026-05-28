import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { asyncHandler } from "../utils/asyncHandler.js";
import { pool } from "../db/pool.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import { insertRefreshToken, getRefreshTokenByJti, revokeAllRefreshTokensForUser, revokeRefreshTokenByJti } from "../db/refreshTokens.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const logoutSchema = z
  .object({
    // If provided, revoke this refresh token only; otherwise revoke all for user.
    refreshToken: z.string().min(1).optional()
  })
  .optional();

/**
 * Minimal user row for auth queries.
 */
type UserRow = { id: string; email: string; password: string; role: string };

function unauthorized(res: Parameters<typeof authRouter.post>[1] extends infer T ? never : never) {
  return res;
}

authRouter.post(
  "/auth/login",
  asyncHandler(async (req, res) => {
    /**
     * Logs a user in by verifying email/password (bcrypt) and returning access+refresh tokens.
     *
     * Returns:
     * - accessToken: short-lived JWT to be used as Bearer token
     * - refreshToken: longer-lived JWT used to obtain new access tokens
     * - user: { id, email, role }
     */
    const { email, password } = loginSchema.parse(req.body);

    const userRes = await pool.query<UserRow>(
      `SELECT id, email, password, role
         FROM app_users
        WHERE email = $1
        LIMIT 1`,
      [email]
    );

    const user = userRes.rows[0];
    if (!user) {
      return res.status(401).json({ error: { message: "Invalid credentials", status: 401 } });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ error: { message: "Invalid credentials", status: 401 } });
    }

    const authUser = { id: user.id, email: user.email, role: user.role as any };

    // Create refresh token record and token
    const idRes = await pool.query<{ id: string; jti: string }>(`SELECT gen_random_uuid() AS id, gen_random_uuid() AS jti`);
    const refreshId = idRes.rows[0]!.id;
    const jti = idRes.rows[0]!.jti;

    // Compute refresh expiry based on seconds-style or string-style is handled by JWT itself.
    // For DB expiry, approximate by 7 days if the env is not a plain number. (Conservative default)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await insertRefreshToken({ id: refreshId, userId: user.id, jti, expiresAt });

    const accessToken = signAccessToken(authUser);
    const refreshToken = signRefreshToken(user.id, jti);

    res.json({
      accessToken,
      refreshToken,
      user: authUser
    });
  })
);

authRouter.post(
  "/auth/refresh",
  asyncHandler(async (req, res) => {
    /**
     * Exchanges a valid (non-revoked, non-expired) refresh token for:
     * - a new access token
     * - a rotated refresh token (old refresh is revoked)
     */
    const { refreshToken } = refreshSchema.parse(req.body);

    let decoded: { sub: string; jti: string };
    try {
      const v = verifyRefreshToken(refreshToken);
      decoded = { sub: v.sub, jti: v.jti };
    } catch {
      return res.status(401).json({ error: { message: "Invalid or expired refresh token", status: 401 } });
    }

    const existing = await getRefreshTokenByJti(decoded.jti);
    if (!existing || existing.revoked_at) {
      return res.status(401).json({ error: { message: "Refresh token revoked", status: 401 } });
    }

    // Rotate: revoke current token and issue a new one
    await revokeRefreshTokenByJti(decoded.jti);

    const userRes = await pool.query<{ id: string; email: string; role: string }>(
      `SELECT id, email, role
         FROM app_users
        WHERE id = $1
        LIMIT 1`,
      [decoded.sub]
    );

    const user = userRes.rows[0];
    if (!user) {
      return res.status(401).json({ error: { message: "User not found", status: 401 } });
    }

    const authUser = { id: user.id, email: user.email, role: user.role as any };

    const idRes = await pool.query<{ id: string; jti: string }>(`SELECT gen_random_uuid() AS id, gen_random_uuid() AS jti`);
    const refreshId = idRes.rows[0]!.id;
    const newJti = idRes.rows[0]!.jti;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await insertRefreshToken({ id: refreshId, userId: user.id, jti: newJti, expiresAt });

    res.json({
      accessToken: signAccessToken(authUser),
      refreshToken: signRefreshToken(user.id, newJti),
      user: authUser
    });
  })
);

authRouter.post(
  "/auth/logout",
  asyncHandler(async (req, res) => {
    /**
     * Logs out by revoking refresh token(s).
     *
     * Body:
     * - optional refreshToken: if provided, revoke only that refresh token; otherwise revoke all for the user.
     *
     * Note: Access tokens are stateless JWTs and cannot be revoked without maintaining an access-token denylist.
     * This implementation relies on short-lived access tokens and refresh revocation.
     */
    const parsed = logoutSchema ? logoutSchema.parse(req.body) : undefined;

    if (parsed?.refreshToken) {
      // Revoke the specific token if possible
      try {
        const v = verifyRefreshToken(parsed.refreshToken);
        await revokeRefreshTokenByJti(v.jti);
      } catch {
        // If token is invalid/expired, treat as already-logged-out.
      }
      return res.json({ ok: true });
    }

    // If no refresh token provided, revoke by authenticated user if available; otherwise no-op.
    // (Frontend can call logout even if it lost state.)
    const userId = req.user?.id;
    if (userId) {
      await revokeAllRefreshTokensForUser(userId);
    }
    return res.json({ ok: true });
  })
);
