import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Roles } from "@smartoutage/shared";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { useAuth } from "./auth/AuthContext";

import { LoginPage } from "./pages/LoginPage";
import { UnauthorizedPage } from "./pages/UnauthorizedPage";
import { NotFoundPage } from "./pages/NotFoundPage";

import { OperatorLayout } from "./layouts/OperatorLayout";
import { CrewLayout } from "./layouts/CrewLayout";
import { CustomerLayout } from "./layouts/CustomerLayout";

import { OperatorHome } from "./pages/OperatorHome";
import { CrewHome } from "./pages/CrewHome";
import { CustomerHome } from "./pages/CustomerHome";

function RoleHomeRedirect() {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;

  if (user.role === Roles.OPERATOR) return <Navigate to="/operator" replace />;
  if (user.role === Roles.CREW) return <Navigate to="/crew" replace />;
  return <Navigate to="/customer" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      <Route path="/" element={<RoleHomeRedirect />} />

      {/* Operator */}
      <Route element={<ProtectedRoute allowedRoles={[Roles.OPERATOR]} />}>
        <Route element={<OperatorLayout />}>
          <Route path="/operator" element={<OperatorHome />} />
        </Route>
      </Route>

      {/* Crew */}
      <Route element={<ProtectedRoute allowedRoles={[Roles.CREW]} />}>
        <Route element={<CrewLayout />}>
          <Route path="/crew" element={<CrewHome />} />
        </Route>
      </Route>

      {/* Customer */}
      <Route element={<ProtectedRoute allowedRoles={[Roles.CUSTOMER]} />}>
        <Route element={<CustomerLayout />}>
          <Route path="/customer" element={<CustomerHome />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
