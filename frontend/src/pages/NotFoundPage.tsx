import React from "react";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div style={{ padding: 24 }}>
      <h2>Not Found</h2>
      <Link to="/">Go home</Link>
    </div>
  );
}
