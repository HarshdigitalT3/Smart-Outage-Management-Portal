import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { Role } from "@smartoutage/shared";
import { useAuth } from "./AuthContext";

// PUBLIC_INTERFACE
export function ProtectedRoute({ allowedRoles }: { allowedRoles?: Role[] }) {
  /**
   * Protects nested routes. If allowedRoles is provided, enforces RBAC.
   *
   * Also respects AuthProvider initialization so we don't briefly render protected screens
   * while a refresh attempt is in-flight.
   */
  const { isAuthenticated, isInitializing, user } = useAuth();
  const location = useLocation();

  if (isInitializing) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Loading…</div>
        <div style={{ color: "#6b7280", fontSize: 13 }}>Checking your session.</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
