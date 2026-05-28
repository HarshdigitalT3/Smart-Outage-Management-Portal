import React, { useEffect, useMemo, useRef, useState } from "react";
import { OutageSeverity, OutageStatus } from "@smartoutage/shared";
import type { CreateOutageRequest, Outage, OutageEvent, OutageSeverity as Sev } from "@smartoutage/shared";
import { useAuth } from "../auth/AuthContext";
import { createOutage, listActiveOutages, resolveOutage } from "../api/outages";
import { subscribeToOutageEvents } from "../realtime/outagesWs";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function severityLabel(sev: Sev): string {
  if (sev === OutageSeverity.CRITICAL) return "Critical";
  if (sev === OutageSeverity.HIGH) return "High";
  if (sev === OutageSeverity.MEDIUM) return "Medium";
  return "Low";
}

function severityColors(sev: Sev): { bg: string; fg: string; border: string } {
  switch (sev) {
    case OutageSeverity.CRITICAL:
      return { bg: "#FEF2F2", fg: "#991B1B", border: "#FECACA" };
    case OutageSeverity.HIGH:
      return { bg: "#FFF7ED", fg: "#9A3412", border: "#FED7AA" };
    case OutageSeverity.MEDIUM:
      return { bg: "#FFFBEB", fg: "#92400E", border: "#FDE68A" };
    case OutageSeverity.LOW:
    default:
      return { bg: "#ECFDF5", fg: "#065F46", border: "#A7F3D0" };
  }
}

function upsertById(list: Outage[], outage: Outage): Outage[] {
  const idx = list.findIndex((o) => o.id === outage.id);
  if (idx === -1) return [outage, ...list];
  const copy = list.slice();
  copy[idx] = outage;
  // keep newest-ish first by createdAt desc
  copy.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return copy;
}

function removeById(list: Outage[], id: string): Outage[] {
  return list.filter((o) => o.id !== id);
}

function modalBackdropStyle(): React.CSSProperties {
  return {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 50
  };
}

function modalCardStyle(): React.CSSProperties {
  return {
    width: "100%",
    maxWidth: 520,
    background: "#ffffff",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
    padding: 16
  };
}

export function OperatorHome() {
  const { accessToken } = useAuth();

  const [outages, setOutages] = useState<Outage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [wsConnected, setWsConnected] = useState(false);

  // Form state (all required)
  const [location, setLocation] = useState("");
  const [faultType, setFaultType] = useState("");
  const [severity, setSeverity] = useState<Sev>(OutageSeverity.MEDIUM);
  const [affectedCustomers, setAffectedCustomers] = useState<string>("0");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Resolve modal state
  const [resolveTarget, setResolveTarget] = useState<Outage | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (!location.trim()) return false;
    if (!faultType.trim()) return false;
    if (!severity) return false;
    const n = Number(affectedCustomers);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return false;
    return true;
  }, [affectedCustomers, faultType, location, severity, submitting]);

  async function load() {
    if (!accessToken) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listActiveOutages(accessToken);
      setOutages(res.outages);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Realtime updates: apply ws events to local list immediately.
  const subscriptionRef = useRef<{ close: () => void } | null>(null);
  useEffect(() => {
    if (!accessToken) return;

    // Reset any previous subscription.
    subscriptionRef.current?.close();
    subscriptionRef.current = subscribeToOutageEvents({
      accessToken,
      onConnectionChange: setWsConnected,
      onEvent: (event: OutageEvent) => {
        setOutages((prev) => {
          if (event.type === "outage_created") return upsertById(prev, event.outage);
          if (event.type === "outage_status_updated") {
            // Backend may emit resolved via status update; if resolved, remove from active list.
            if (event.outage.status === OutageStatus.RESOLVED) return removeById(prev, event.outage.id);
            return upsertById(prev, event.outage);
          }
          if (event.type === "outage_resolved") return removeById(prev, event.outage.id);
          return prev;
        });
      },
      onError: () => {
        // Keep quiet; websocket can fail in some environments and the UI still works via manual refresh.
      }
    });

    return () => {
      subscriptionRef.current?.close();
      subscriptionRef.current = null;
    };
  }, [accessToken]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    if (!canSubmit) return;

    setSubmitting(true);
    setSubmitError(null);

    const payload: CreateOutageRequest = {
      location: location.trim(),
      faultType: faultType.trim(),
      severity,
      affectedCustomers: Number(affectedCustomers)
    };

    try {
      const res = await createOutage(accessToken, payload);

      // Optimistic add/update in case WS isn't connected.
      setOutages((prev) => upsertById(prev, res.outage));

      // Reset form for under-2-min workflow.
      setLocation("");
      setFaultType("");
      setSeverity(OutageSeverity.MEDIUM);
      setAffectedCustomers("0");
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmResolve() {
    if (!accessToken || !resolveTarget) return;
    setResolving(true);
    setResolveError(null);

    try {
      await resolveOutage(accessToken, resolveTarget.id);

      // Optimistic remove; WS will also remove.
      setOutages((prev) => removeById(prev, resolveTarget.id));
      setResolveTarget(null);
    } catch (err) {
      setResolveError((err as Error).message);
    } finally {
      setResolving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h2 style={{ margin: 0 }}>Outage Management</h2>
        <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
          Operator dashboard for logging and resolving outages.{" "}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginLeft: 8,
              padding: "2px 8px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: wsConnected ? "#ECFDF5" : "#F3F4F6",
              color: wsConnected ? "#065F46" : "#374151"
            }}
            title={wsConnected ? "Realtime connected" : "Realtime disconnected (will auto-reconnect)"}
          >
            {wsConnected ? "Realtime: connected" : "Realtime: reconnecting"}
          </span>
        </div>
      </div>

      {/* Log New Outage */}
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <h3 style={{ margin: 0 }}>Log New Outage</h3>
          <div style={{ fontSize: 12, color: "#6b7280" }}>All fields required</div>
        </div>

        <form onSubmit={onSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#374151" }}>Location</div>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., Downtown Substation"
              style={{ padding: 10, borderRadius: 8, border: "1px solid #d1d5db" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#374151" }}>Fault Type</div>
            <input
              value={faultType}
              onChange={(e) => setFaultType(e.target.value)}
              placeholder="e.g., Transformer failure"
              style={{ padding: 10, borderRadius: 8, border: "1px solid #d1d5db" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#374151" }}>Severity</div>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Sev)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid #d1d5db", background: "#fff" }}
            >
              <option value={OutageSeverity.LOW}>Low</option>
              <option value={OutageSeverity.MEDIUM}>Medium</option>
              <option value={OutageSeverity.HIGH}>High</option>
              <option value={OutageSeverity.CRITICAL}>Critical</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#374151" }}>Affected Customers</div>
            <input
              value={affectedCustomers}
              onChange={(e) => setAffectedCustomers(e.target.value)}
              inputMode="numeric"
              placeholder="0"
              style={{ padding: 10, borderRadius: 8, border: "1px solid #d1d5db" }}
            />
          </label>

          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid #111827",
                background: canSubmit ? "#111827" : "#9CA3AF",
                color: "#ffffff",
                cursor: canSubmit ? "pointer" : "not-allowed",
                fontWeight: 600
              }}
            >
              {submitting ? "Logging…" : "Log Outage"}
            </button>

            {submitError ? (
              <div
                role="alert"
                style={{
                  color: "#991b1b",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  padding: "8px 10px",
                  borderRadius: 8,
                  fontSize: 13
                }}
              >
                {submitError}
              </div>
            ) : (
              <div style={{ color: "#6b7280", fontSize: 13 }}>
                Tip: keep details short so this can be completed in under 2 minutes.
              </div>
            )}
          </div>
        </form>
      </section>

      {/* Dashboard */}
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <h3 style={{ margin: 0 }}>Active Outages</h3>
          <button
            onClick={() => void load()}
            disabled={loading}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#fff",
              cursor: loading ? "not-allowed" : "pointer"
            }}
            title="Refresh from API"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {loadError ? (
          <div
            role="alert"
            style={{
              marginTop: 12,
              color: "#991b1b",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              padding: 10,
              borderRadius: 8
            }}
          >
            {loadError}
          </div>
        ) : null}

        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "10px 8px" }}>Location</th>
                <th style={{ padding: "10px 8px" }}>Fault</th>
                <th style={{ padding: "10px 8px" }}>Severity</th>
                <th style={{ padding: "10px 8px" }}>Affected</th>
                <th style={{ padding: "10px 8px" }}>Created</th>
                <th style={{ padding: "10px 8px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: 12, color: "#6b7280" }}>
                    Loading outages…
                  </td>
                </tr>
              ) : outages.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 12, color: "#6b7280" }}>
                    No active outages.
                  </td>
                </tr>
              ) : (
                outages.map((o) => {
                  const c = severityColors(o.severity);
                  return (
                    <tr key={o.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 8px", fontWeight: 600 }}>{o.location}</td>
                      <td style={{ padding: "10px 8px" }}>{o.faultType}</td>
                      <td style={{ padding: "10px 8px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "3px 10px",
                            borderRadius: 999,
                            border: `1px solid ${c.border}`,
                            background: c.bg,
                            color: c.fg,
                            fontWeight: 700,
                            fontSize: 12
                          }}
                          title={`Severity: ${o.severity}`}
                        >
                          {severityLabel(o.severity)}
                        </span>
                      </td>
                      <td style={{ padding: "10px 8px" }}>{o.affectedCustomers}</td>
                      <td style={{ padding: "10px 8px", color: "#374151" }}>{formatDateTime(o.createdAt)}</td>
                      <td style={{ padding: "10px 8px" }}>
                        <button
                          onClick={() => {
                            setResolveError(null);
                            setResolveTarget(o);
                          }}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid #dc2626",
                            background: "#fff",
                            color: "#dc2626",
                            cursor: "pointer",
                            fontWeight: 600
                          }}
                        >
                          Resolve…
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Resolve confirmation modal */}
      {resolveTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Resolve outage confirmation"
          style={modalBackdropStyle()}
          onMouseDown={(e) => {
            // Close when clicking outside the card.
            if (e.target === e.currentTarget && !resolving) setResolveTarget(null);
          }}
        >
          <div style={modalCardStyle()}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <h3 style={{ margin: 0 }}>Resolve outage?</h3>
              <button
                onClick={() => (!resolving ? setResolveTarget(null) : undefined)}
                aria-label="Close"
                style={{ border: "none", background: "transparent", cursor: resolving ? "not-allowed" : "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: 10, color: "#374151", fontSize: 14 }}>
              You are about to mark this outage as <b>resolved</b>. This will remove it from the active dashboard.
            </div>

            <div style={{ marginTop: 12, padding: 10, border: "1px solid #e5e7eb", borderRadius: 8, background: "#f9fafb" }}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Outage</div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>{resolveTarget.location}</div>
              <div style={{ color: "#374151", marginTop: 2 }}>{resolveTarget.faultType}</div>
              <div style={{ color: "#6b7280", marginTop: 6, fontSize: 13 }}>
                Severity: {severityLabel(resolveTarget.severity)} · Affected: {resolveTarget.affectedCustomers}
              </div>
            </div>

            {resolveError ? (
              <div
                role="alert"
                style={{
                  marginTop: 12,
                  color: "#991b1b",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  padding: 10,
                  borderRadius: 8,
                  fontSize: 13
                }}
              >
                {resolveError}
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button
                onClick={() => (!resolving ? setResolveTarget(null) : undefined)}
                disabled={resolving}
                style={{
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  cursor: resolving ? "not-allowed" : "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmResolve()}
                disabled={resolving}
                style={{
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid #dc2626",
                  background: "#dc2626",
                  color: "#fff",
                  cursor: resolving ? "not-allowed" : "pointer",
                  fontWeight: 700
                }}
              >
                {resolving ? "Resolving…" : "Confirm resolve"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
