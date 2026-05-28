import React, { createContext, useContext, useMemo, useState } from "react";
import type { AuthUser } from "@smartoutage/shared";
import { login as loginApi } from "../api/auth";

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

// PUBLIC_INTERFACE
export function AuthProvider({ children }: { children: React.ReactNode }) {
  /**
   * Provides authentication state to the app.
   * For foundation scaffold, persists token/user in memory only.
   */
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token && user),
      async login(email: string, password: string) {
        const result = await loginApi(email, password);
        setToken(result.token);
        setUser(result.user);
      },
      logout() {
        setToken(null);
        setUser(null);
      }
    }),
    [token, user]
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
