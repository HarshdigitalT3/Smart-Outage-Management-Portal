import React from "react";
import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function OperatorLayout() {
  const { user, logout } = useAuth();

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside style={{ width: 240, padding: 16, borderRight: "1px solid #e5e7eb" }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Operator</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>{user?.email}</div>
        <nav style={{ display: "grid", gap: 8 }}>
          <Link to="/operator/dashboard">Dashboard</Link>
          <Link to="/operator/map">Live Map</Link>
          <Link to="/operator/audits/resolved">Resolution Audit</Link>
        </nav>
        <button onClick={logout} style={{ marginTop: 16 }}>
          Logout
        </button>
      </aside>
      <main style={{ flex: 1, padding: 24 }}>
        <Outlet />
      </main>
    </div>
  );
}
