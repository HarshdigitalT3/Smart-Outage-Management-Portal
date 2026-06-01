import { apiFetch } from "./client";
import type { AuthUser } from "@smartoutage/shared";

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

export type RefreshResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

// PUBLIC_INTERFACE
export async function login(email: string, password: string): Promise<LoginResponse> {
  /**
   * Calls backend POST /api/auth/login.
   *
   * Returns:
   * - accessToken: short-lived JWT
   * - refreshToken: long-lived JWT (rotated by /refresh)
   * - user: { id, email, role }
   */
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });

  if (!res.ok) {
    // Backend returns { error: { message, status } }
    let message = "Login failed";
    try {
      const body = (await res.json()) as any;
      message = body?.error?.message || message;
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(message);
  }

  return res.json();
}

// PUBLIC_INTERFACE
export async function refresh(refreshToken: string): Promise<RefreshResponse> {
  /**
   * Calls backend POST /api/auth/refresh.
   *
   * On success returns rotated refresh token and new access token.
   */
  const res = await apiFetch("/api/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken })
  });

  if (!res.ok) {
    let message = "Session expired";
    try {
      const body = (await res.json()) as any;
      message = body?.error?.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json();
}

// PUBLIC_INTERFACE
export async function logout(refreshToken?: string): Promise<void> {
  /**
   * Calls backend POST /api/auth/logout.
   *
   * If refreshToken is provided, backend revokes that token; otherwise backend may revoke all tokens for user
   * (if the request is authenticated on the backend). Frontend should still clear local storage regardless.
   */
  const res = await apiFetch("/api/auth/logout", {
    method: "POST",
    body: JSON.stringify(refreshToken ? { refreshToken } : {})
  });

  // Even if logout fails (e.g., network), frontend should consider the user logged out locally.
  if (!res.ok) return;
}
