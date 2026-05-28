import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import type { Role } from "@smartoutage/shared";
import { useAuth } from "./AuthContext";

// PUBLIC_INTERFACE
export function ProtectedRoute({ allowedRoles }: { allowedRoles?: Role[] }) {
  /**
   * Protects nested routes. If allowedRoles is provided, enforces RBAC.
   */
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
