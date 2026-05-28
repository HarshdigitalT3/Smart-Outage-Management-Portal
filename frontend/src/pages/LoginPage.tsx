import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("operator@test.com");
  const [password, setPassword] = useState("password");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      // Navigate will be handled by App once auth state updates; do a safe default:
      navigate("/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "80px auto", padding: 24, border: "1px solid #e5e7eb", borderRadius: 8 }}>
      <h1 style={{ marginTop: 0 }}>Sign in</h1>
      <p style={{ color: "#6b7280" }}>Use seeded accounts (operator/crew/customer) to test RBAC routing.</p>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          <div style={{ fontSize: 12, color: "#374151" }}>Email</div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", padding: 10 }} />
        </label>
        <label>
          <div style={{ fontSize: 12, color: "#374151" }}>Password</div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            style={{ width: "100%", padding: 10 }}
          />
        </label>
        {error ? <div style={{ color: "#b91c1c" }}>{error}</div> : null}
        <button type="submit" style={{ padding: 10 }}>
          Login
        </button>
      </form>
    </div>
  );
}
