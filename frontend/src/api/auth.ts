import { apiFetch } from "./client";
import type { AuthUser } from "@smartoutage/shared";

// PUBLIC_INTERFACE
export async function login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  /**
   * Calls backend /api/auth/login.
   */
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });

  if (!res.ok) {
    throw new Error("Login failed");
  }
  return res.json();
}
