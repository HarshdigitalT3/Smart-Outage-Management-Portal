import { pool } from "./pool.js";

type RefreshTokenRow = {
  id: string;
  user_id: string;
  jti: string;
  revoked_at: string | null;
  expires_at: string;
};

// PUBLIC_INTERFACE
export async function insertRefreshToken(params: { id: string; userId: string; jti: string; expiresAt: Date }): Promise<void> {
  /**
   * Inserts a refresh token record used to validate refresh + support logout revocation.
   */
  await pool.query(
    `INSERT INTO app_refresh_tokens (id, user_id, jti, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [params.id, params.userId, params.jti, params.expiresAt.toISOString()]
  );
}

// PUBLIC_INTERFACE
export async function getRefreshTokenByJti(jti: string): Promise<RefreshTokenRow | null> {
  /**
   * Fetches a refresh token record by its jti.
   */
  const res = await pool.query<RefreshTokenRow>(
    `SELECT id, user_id, jti, revoked_at, expires_at
       FROM app_refresh_tokens
      WHERE jti = $1
      LIMIT 1`,
    [jti]
  );
  return res.rows[0] ?? null;
}

// PUBLIC_INTERFACE
export async function revokeRefreshTokenByJti(jti: string): Promise<void> {
  /**
   * Revokes a refresh token so it can no longer be used.
   */
  await pool.query(`UPDATE app_refresh_tokens SET revoked_at = NOW() WHERE jti = $1 AND revoked_at IS NULL`, [jti]);
}

// PUBLIC_INTERFACE
export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
  /**
   * Revokes all refresh tokens for a user (logout-all / conservative logout).
   */
  await pool.query(`UPDATE app_refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
}
