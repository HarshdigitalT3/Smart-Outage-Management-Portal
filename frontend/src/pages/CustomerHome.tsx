import React, { useMemo, useState } from "react";
import { CustomerOutageStatus } from "@smartoutage/shared";
import type { CustomerStatusLookupResponse } from "@smartoutage/shared";
import { apiFetch } from "../api/client";

/**
 * Minimal, dependency-free customer self-serve lookup page.
 *
 * Note: This route currently sits behind the Customer protected layout in App.tsx.
 * The backend endpoint it calls is public/no-login; making the page public can be
 * done later by adjusting routing.
 */

type UiState =
  | { kind: "idle" }
  | { kind: "loading"; postcode: string }
  | { kind: "success"; postcode: string; data: CustomerStatusLookupResponse }
  | { kind: "error"; postcode: string; message: string };

function normalizePostcode(input: string): string {
  return input.trim().toUpperCase();
}

function isLikelyValidPostcode(input: string): boolean {
  // Mirror backend validation broadly: 2..12 chars, alphanumerics, space, hyphen.
  const s = input.trim();
  if (s.length < 2 || s.length > 12) return false;
  return /^[A-Za-z0-9 -]+$/.test(s);
}

function severityColor(severity: CustomerStatusLookupResponse["severity"]): string {
  switch (severity) {
    case "low":
      return "#16a34a"; // green
    case "medium":
      return "#f59e0b"; // amber
    case "high":
      return "#f97316"; // orange
    case "critical":
      return "#dc2626"; // red
    default:
      return "#6b7280"; // gray
  }
}

function formatDateTime(iso: string): string {
  // Keep formatting simple and local.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

// PUBLIC_INTERFACE
export function CustomerHome() {
  /** Customer outage status lookup page (postcode search). */
  const [postcodeInput, setPostcodeInput] = useState("");
  const [ui, setUi] = useState<UiState>({ kind: "idle" });

  const normalized = useMemo(() => normalizePostcode(postcodeInput), [postcodeInput]);
  const canSearch = useMemo(() => isLikelyValidPostcode(postcodeInput), [postcodeInput]);

  async function runSearch(postcode: string) {
    const postcodeNormalized = normalizePostcode(postcode);

    setUi({ kind: "loading", postcode: postcodeNormalized });

    try {
      const res = await apiFetch(
        `/api/customer/status?postcode=${encodeURIComponent(postcodeNormalized)}`,
        { method: "GET" }
      );

      if (!res.ok) {
        // Backend returns 400 "Invalid postcode" for invalid inputs; other codes are generic errors.
        let msg = "Something went wrong. Please try again.";
        if (res.status === 400) msg = "Please enter a valid postcode and try again.";
        if (res.status >= 500) msg = "Service is temporarily unavailable. Please try again shortly.";
        setUi({ kind: "error", postcode: postcodeNormalized, message: msg });
        return;
      }

      const data = (await res.json()) as CustomerStatusLookupResponse;
      setUi({ kind: "success", postcode: postcodeNormalized, data });
    } catch (e) {
      setUi({
        kind: "error",
        postcode: postcodeNormalized,
        message:
          "Network error. Please check your connection and try again."
      });
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSearch) {
      setUi({
        kind: "error",
        postcode: normalized,
        message: "Please enter a valid postcode (2–12 characters)."
      });
      return;
    }
    void runSearch(postcodeInput);
  }

  const showHelper =
    ui.kind === "idle" ||
    (ui.kind === "error" && !isLikelyValidPostcode(postcodeInput));

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Check outage status</h2>
        <p style={{ marginTop: 8, color: "#4b5563" }}>
          Enter your postcode to see if there’s an active outage in your area.
        </p>
      </header>

      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 280px" }}>
          <span style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Postcode</span>
          <input
            value={postcodeInput}
            onChange={(e) => setPostcodeInput(e.target.value)}
            placeholder="e.g. 2000"
            inputMode="text"
            autoComplete="postal-code"
            aria-invalid={postcodeInput.length > 0 && !isLikelyValidPostcode(postcodeInput)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #d1d5db"
            }}
          />
        </label>

        <div style={{ alignSelf: "end" }}>
          <button
            type="submit"
            disabled={!canSearch || ui.kind === "loading"}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #111827",
              background: !canSearch || ui.kind === "loading" ? "#9ca3af" : "#111827",
              color: "white",
              cursor: !canSearch || ui.kind === "loading" ? "not-allowed" : "pointer",
              minWidth: 120
            }}
          >
            {ui.kind === "loading" ? "Searching…" : "Search"}
          </button>
        </div>
      </form>

      {showHelper && (
        <p style={{ marginTop: 10, color: "#6b7280" }}>
          Tip: Use letters/numbers, spaces and hyphens only.
        </p>
      )}

      <section style={{ marginTop: 20 }}>
        {ui.kind === "idle" && (
          <div
            style={{
              padding: 16,
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              background: "#fafafa"
            }}
          >
            <p style={{ margin: 0, color: "#374151" }}>
              Enter a postcode above and press Search.
            </p>
          </div>
        )}

        {ui.kind === "loading" && (
          <div
            aria-live="polite"
            style={{
              padding: 16,
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              background: "#fafafa"
            }}
          >
            <p style={{ margin: 0, color: "#374151" }}>
              Looking up outage status for <strong>{ui.postcode}</strong>…
            </p>
          </div>
        )}

        {ui.kind === "error" && (
          <div
            role="alert"
            style={{
              padding: 16,
              border: "1px solid #fecaca",
              borderRadius: 10,
              background: "#fef2f2"
            }}
          >
            <p style={{ margin: 0, color: "#991b1b", fontWeight: 600 }}>We couldn’t complete your request</p>
            <p style={{ marginTop: 8, marginBottom: 0, color: "#7f1d1d" }}>{ui.message}</p>
          </div>
        )}

        {ui.kind === "success" && (
          <div
            style={{
              padding: 16,
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              background: "white"
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 10 }}>
              Results for <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{ui.postcode}</span>
            </h3>

            {ui.data.status === CustomerOutageStatus.NO_OUTAGE ? (
              <>
                <p style={{ margin: 0, color: "#065f46", fontWeight: 700 }}>No active outages reported</p>
                <p style={{ marginTop: 8, marginBottom: 0, color: "#374151" }}>
                  Last updated: <strong>{formatDateTime(ui.data.lastUpdated)}</strong>
                </p>
              </>
            ) : (
              <>
                <p style={{ margin: 0, fontWeight: 700 }}>
                  Active outage in your area
                </p>

                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: "#6b7280" }}>Severity:</span>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 10px",
                        borderRadius: 999,
                        background: "#f3f4f6",
                        border: `1px solid ${severityColor(ui.data.severity)}`,
                        color: severityColor(ui.data.severity),
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        fontSize: 12
                      }}
                    >
                      {ui.data.severity ?? "unknown"}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: "#6b7280" }}>Estimated restoration:</span>
                    <span style={{ fontWeight: 600, color: "#111827" }}>
                      {ui.data.eta ? formatDateTime(ui.data.eta) : "Not available yet"}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: "#6b7280" }}>Last updated:</span>
                    <span style={{ fontWeight: 600, color: "#111827" }}>
                      {formatDateTime(ui.data.lastUpdated)}
                    </span>
                  </div>
                </div>
              </>
            )}

            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                onClick={() => void runSearch(ui.postcode)}
                disabled={ui.kind === "loading"}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: "#f9fafb",
                  cursor: "pointer"
                }}
              >
                Refresh
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
