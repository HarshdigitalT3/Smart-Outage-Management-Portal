import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AuthUser, Role } from "@smartoutage/shared";
import { Roles } from "@smartoutage/shared";
import { login as loginApi, logout as logoutApi, refresh as refreshApi } from "../api/auth";

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const STORAGE_KEYS = {
  accessToken: "smartoutage.accessToken",
  refreshToken: "smartoutage.refreshToken",
  user: "smartoutage.user"
} as const;

const AuthContext = createContext<AuthState | undefined>(undefined);

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Decodes JWT payload without validating signature (frontend convenience only).
 * Used strictly to check exp and avoid using obviously expired tokens.
 */
function decodeJwtPayload(token: string): { exp?: number; role?: Role } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payloadB64 = parts[1];
  try {
    // base64url decode
    const base64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isJwtExpired(token: string, skewSeconds = 10): boolean {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  if (!exp) return false; // if missing exp, do not force logout here
  const nowSeconds = Math.floor(Date.now() / 1000);
  return exp <= nowSeconds + skewSeconds;
}

// PUBLIC_INTERFACE
export function roleToLandingPath(role: Role): string {
  /**
   * Maps a role to its post-login landing page path.
   *
   * Acceptance criteria:
   * - Operator → /operator/dashboard
   * - Field Crew → /crew/jobs
   * - Customer → /customer/status
   */
  if (role === Roles.OPERATOR) return "/operator/dashboard";
  if (role === Roles.CREW) return "/crew/jobs";
  return "/customer/status";
}

// PUBLIC_INTERFACE
export function AuthProvider({ children }: { children: React.ReactNode }) {
  /**
   * Provides authentication state to the app.
   *
   * Responsibilities:
   * - Persist tokens + user in localStorage
   * - On app load, if access token is expired, attempt refresh using refresh token
   * - If refresh fails or tokens are missing/invalid, clear auth and treat as logged out
   */
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEYS.accessToken));
  const [refreshToken, setRefreshToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEYS.refreshToken));
  const [user, setUser] = useState<AuthUser | null>(() => safeJsonParse<AuthUser>(localStorage.getItem(STORAGE_KEYS.user)));

  const [isInitializing, setIsInitializing] = useState(true);

  // Prevent duplicate refresh calls during initialization.
  const initAttemptedRef = useRef(false);

  function persist(next: { accessToken: string | null; refreshToken: string | null; user: AuthUser | null }) {
    setAccessToken(next.accessToken);
    setRefreshToken(next.refreshToken);
    setUser(next.user);

    if (next.accessToken) localStorage.setItem(STORAGE_KEYS.accessToken, next.accessToken);
    else localStorage.removeItem(STORAGE_KEYS.accessToken);

    if (next.refreshToken) localStorage.setItem(STORAGE_KEYS.refreshToken, next.refreshToken);
    else localStorage.removeItem(STORAGE_KEYS.refreshToken);

    if (next.user) localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(next.user));
    else localStorage.removeItem(STORAGE_KEYS.user);
  }

  async function ensureFreshSession(): Promise<void> {
    // If no access token or no user, we treat as logged out (even if refresh token exists).
    // Refresh is only attempted when we have a refresh token.
    if (!accessToken || !user) return;

    if (!isJwtExpired(accessToken)) return;

    if (!refreshToken) {
      persist({ accessToken: null, refreshToken: null, user: null });
      return;
    }

    try {
      const result = await refreshApi(refreshToken);
      persist({ accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user });
    } catch {
      // Expired/invalid refresh → clear and force login
      persist({ accessToken: null, refreshToken: null, user: null });
    }
  }

  useEffect(() => {
    if (initAttemptedRef.current) return;
    initAttemptedRef.current = true;

    (async () => {
      try {
        // If we have an access token but it's expired, refresh (or clear) before rendering protected routes.
        await ensureFreshSession();
      } finally {
        setIsInitializing(false);
      }
    })();
    // Intentionally run once; ensureFreshSession reads current state from closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logoutInFlight = useRef<Promise<void> | null>(null);

  const value = useMemo<AuthState>(
    () => ({
      accessToken,
      refreshToken,
      user,
      isInitializing,
      isAuthenticated: Boolean(accessToken && user),
      async login(email: string, password: string) {
        const result = await loginApi(email, password);
        persist({ accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user });
      },
      async logout() {
        // Idempotent + prevent double-click multiple requests.
        if (logoutInFlight.current) return logoutInFlight.current;

        const currentRefresh = refreshToken;
        const p = (async () => {
          try {
            // Fire-and-forget semantics, but we still await to simplify flow.
            await logoutApi(currentRefresh ?? undefined);
          } finally {
            persist({ accessToken: null, refreshToken: null, user: null });
            logoutInFlight.current = null;
          }
        })();

        logoutInFlight.current = p;
        return p;
      }
    }),
    [accessToken, refreshToken, user, isInitializing]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// PUBLIC_INTERFACE
export function useAuth(): AuthState {
  /**
   * Hook to access AuthContext.
   */
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
