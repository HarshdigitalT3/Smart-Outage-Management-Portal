import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { roleToLandingPath, useAuth } from "../auth/AuthContext";

export function LoginPage() {
  const { login, isAuthenticated, isInitializing, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const fromPath = (location.state as any)?.from as string | undefined;

  const [email, setEmail] = useState("operator@test.com");
  const [password, setPassword] = useState("password");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => email.trim().length > 0 && password.length > 0 && !submitting, [email, password, submitting]);

  useEffect(() => {
    // Clear errors when user edits fields (reduces confusion).
    setError(null);
  }, [email, password]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      await login(email, password);

      // Prefer returning to the originally requested protected path if it exists,
      // otherwise go to role landing page.
      const next =
        (typeof fromPath === "string" && fromPath.startsWith("/")) || fromPath === "/"
          ? fromPath
          : undefined;

      navigate(next ?? "/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // If we are already logged in, do not show the login form; go to role landing.
  if (!isInitializing && isAuthenticated && user) {
    return <Navigate to={roleToLandingPath(user.role)} replace />;
  }

  return (
    <div style={{ maxWidth: 420, margin: "80px auto", padding: 24, border: "1px solid #e5e7eb", borderRadius: 8 }}>
      <h1 style={{ marginTop: 0 }}>Sign in</h1>
      <p style={{ color: "#6b7280", marginTop: 8 }}>
        Use seeded accounts to test RBAC routing:
        <br />
        operator@test.com / password
        <br />
        crew@test.com / password
        <br />
        customer@test.com / password
      </p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label>
          <div style={{ fontSize: 12, color: "#374151" }}>Email</div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            inputMode="email"
            style={{ width: "100%", padding: 10 }}
          />
        </label>

        <label>
          <div style={{ fontSize: 12, color: "#374151" }}>Password</div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            style={{ width: "100%", padding: 10 }}
          />
        </label>

        {error ? (
          <div
            role="alert"
            style={{
              color: "#991b1b",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              padding: 10,
              borderRadius: 6
            }}
          >
            {error}
          </div>
        ) : null}

        <button type="submit" disabled={!canSubmit} style={{ padding: 10, cursor: canSubmit ? "pointer" : "not-allowed" }}>
          {submitting ? "Signing in…" : "Login"}
        </button>
      </form>
    </div>
  );
}
