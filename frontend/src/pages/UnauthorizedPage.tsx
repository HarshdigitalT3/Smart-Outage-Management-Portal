import React from "react";
import { Link } from "react-router-dom";

export function UnauthorizedPage() {
  return (
    <div style={{ padding: 24 }}>
      <h2>Unauthorized</h2>
      <p>You do not have access to that page.</p>
      <Link to="/">Go home</Link>
    </div>
  );
}
