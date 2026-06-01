import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { CrewMember, CrewDispatchEvent, JobCard, OutageAudit, Outage } from "@smartoutage/shared";
import { useAuth } from "../auth/AuthContext";
import { getOutageDetail } from "../api/outages";
import { assignCrewToOutage, listAvailableCrew } from "../api/crewDispatch";
import { subscribeToCrewDispatchEvents } from "../realtime/crewDispatchWs";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function jobStatusLabel(status: string): string {
  if (status === "assigned") return "Assigned";
  if (status === "en_route") return "En Route";
  if (status === "on_site") return "On Site";
  if (status === "resolved") return "Resolved";
  return status;
}

function jobStatusColors(status: string): { bg: string; fg: string; border: string } {
  switch (status) {
    case "assigned":
      return { bg: "#EFF6FF", fg: "#1D4ED8", border: "#BFDBFE" };
    case "en_route":
      return { bg: "#FFFBEB", fg: "#92400E", border: "#FDE68A" };
    case "on_site":
      return { bg: "#ECFDF5", fg: "#065F46", border: "#A7F3D0" };
    case "resolved":
      return { bg: "#F3F4F6", fg: "#374151", border: "#E5E7EB" };
    default:
      return { bg: "#F3F4F6", fg: "#374151", border: "#E5E7EB" };
  }
}

export function OperatorOutageDetail() {
  const { outageId = "" } = useParams<{ outageId: string }>();
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [outage, setOutage] = useState<Outage | null>(null);
  const [audits, setAudits] = useState<OutageAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [wsConnected, setWsConnected] = useState(false);

  // Dispatch panel state
  const [availableCrew, setAvailableCrew] = useState<CrewMember[]>([]);
  const [loadingCrew, setLoadingCrew] = useState(false);
  const [crewError, setCrewError] = useState<string | null>(null);

  const [selectedCrewUserId, setSelectedCrewUserId] = useState<string>("");
  const [safetyNotes, setSafetyNotes] = useState<string>("");

  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Local view of the current job for this outage (best-effort).
  const [activeJob, setActiveJob] = useState<JobCard | null>(null);

  const canAssign = useMemo(() => {
    if (!selectedCrewUserId) return false;
    if (assigning) return false;
    if (!accessToken) return false;
    if (!outageId) return false;
    return true;
  }, [selectedCrewUserId, assigning, accessToken, outageId]);

  async function loadOutage() {
    if (!accessToken) return;
    if (!outageId) return;

    setLoading(true);
    setLoadError(null);
    try {
      const res = await getOutageDetail(accessToken, outageId);
      setOutage(res.outage);
      setAudits(res.audits);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadCrew() {
    if (!accessToken) return;
    setLoadingCrew(true);
    setCrewError(null);
    try {
      const res = await listAvailableCrew(accessToken);
      setAvailableCrew(res.crew);
      // Default selection: first crew if none chosen.
      setSelectedCrewUserId((prev) => prev || res.crew[0]?.userId || "");
    } catch (e) {
      setCrewError((e as Error).message);
    } finally {
      setLoadingCrew(false);
    }
  }

  useEffect(() => {
    void loadOutage();
    void loadCrew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, outageId]);

  // Realtime: listen for job status updates and show them on this page if they match outageId.
  const subRef = useRef<{ close: () => void } | null>(null);
  useEffect(() => {
    if (!accessToken) return;

    subRef.current?.close();
    subRef.current = subscribeToCrewDispatchEvents({
      accessToken,
      onConnectionChange: setWsConnected,
      onEvent: (event: CrewDispatchEvent) => {
        // We only know outageId for job_assigned; job_status_updated contains the job with outageId.
        if (event.type === "job_assigned") {
          if (event.job.outageId === outageId) setActiveJob(event.job);
          // Crew assigned becomes unavailable; refresh list to keep operator dropdown accurate.
          void loadCrew();
        }
        if (event.type === "job_status_updated") {
          if (event.job.outageId === outageId) setActiveJob(event.job);
          // If job resolved, crew becomes available again. Refresh list.
          if (event.job.status === "resolved") void loadCrew();
        }
      },
      onError: () => {
        // Non-fatal; page still works via API calls.
      }
    });

    return () => {
      subRef.current?.close();
      subRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, outageId]);

  async function onAssign() {
    if (!accessToken) return;
    if (!outageId) return;
    if (!canAssign) return;

    setAssigning(true);
    setAssignError(null);

    try {
      const res = await assignCrewToOutage(accessToken, outageId, {
        crewUserId: selectedCrewUserId,
        safetyNotes: safetyNotes.trim() ? safetyNotes.trim() : undefined
      });

      // Optimistic: show assignment immediately even if WS is delayed.
      setActiveJob(res.job);

      // Refresh available crew list; assigned crew should disappear.
      await loadCrew();
    } catch (e) {
      setAssignError((e as Error).message);
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Outage Detail</h2>
          <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
            Dispatch a crew and monitor job status in real time.
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

        <button
          onClick={() => navigate(-1)}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#fff",
            cursor: "pointer",
            height: 36
          }}
        >
          Back
        </button>
      </div>

      {loadError ? (
        <div
          role="alert"
          style={{
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

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
        {loading || !outage ? (
          <div style={{ color: "#6b7280" }}>Loading outage…</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{outage.location}</div>
            <div style={{ color: "#374151" }}>
              <span style={{ fontWeight: 700 }}>Fault:</span> {outage.faultType}
            </div>
            <div style={{ color: "#374151" }}>
              <span style={{ fontWeight: 700 }}>Affected customers:</span> {outage.affectedCustomers}
            </div>
            <div style={{ color: "#6b7280", fontSize: 13 }}>Created: {formatDateTime(outage.createdAt)}</div>
          </div>
        )}
      </section>

      {/* Crew dispatch panel */}
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <h3 style={{ margin: 0 }}>Crew Dispatch</h3>
          <button
            onClick={() => void loadCrew()}
            disabled={loadingCrew}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#fff",
              cursor: loadingCrew ? "not-allowed" : "pointer"
            }}
            title="Refresh available crew"
          >
            {loadingCrew ? "Refreshing…" : "Refresh crew"}
          </button>
        </div>

        {activeJob ? (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: "#6b7280" }}>Active job:</div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "3px 10px",
                borderRadius: 999,
                border: `1px solid ${jobStatusColors(activeJob.status).border}`,
                background: jobStatusColors(activeJob.status).bg,
                color: jobStatusColors(activeJob.status).fg,
                fontWeight: 800,
                fontSize: 12
              }}
              title={`Job status: ${activeJob.status}`}
            >
              {jobStatusLabel(activeJob.status)}
            </span>
            <div style={{ color: "#6b7280", fontSize: 12 }}>Updated: {formatDateTime(activeJob.updatedAt)}</div>
          </div>
        ) : (
          <div style={{ marginTop: 10, color: "#6b7280", fontSize: 13 }}>
            No job assignment detected yet for this outage (this view updates in real time after you assign).
          </div>
        )}

        {crewError ? (
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
            {crewError}
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#374151" }}>Available crew</div>
            <select
              value={selectedCrewUserId}
              onChange={(e) => setSelectedCrewUserId(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid #d1d5db", background: "#fff" }}
            >
              {availableCrew.length === 0 ? <option value="">No available crew</option> : null}
              {availableCrew.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#374151" }}>Safety notes (optional)</div>
            <input
              value={safetyNotes}
              onChange={(e) => setSafetyNotes(e.target.value)}
              placeholder="e.g., downed lines reported; wear PPE"
              style={{ padding: 10, borderRadius: 8, border: "1px solid #d1d5db" }}
            />
          </label>

          {assignError ? (
            <div
              role="alert"
              style={{
                gridColumn: "1 / -1",
                color: "#991b1b",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                padding: 10,
                borderRadius: 8,
                fontSize: 13
              }}
            >
              {assignError}
            </div>
          ) : null}

          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={() => void onAssign()}
              disabled={!canAssign || availableCrew.length === 0}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid #111827",
                background: canAssign && availableCrew.length ? "#111827" : "#9CA3AF",
                color: "#ffffff",
                cursor: canAssign && availableCrew.length ? "pointer" : "not-allowed",
                fontWeight: 700
              }}
              title={availableCrew.length === 0 ? "No available crew" : undefined}
            >
              {assigning ? "Assigning…" : "Assign crew"}
            </button>

            <div style={{ color: "#6b7280", fontSize: 13 }}>
              After assigning, the crew member will see the job card immediately on their mobile job list.
            </div>
          </div>
        </div>
      </section>

      {/* Audit log */}
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <h3 style={{ margin: 0 }}>Outage Audit</h3>
          <button
            onClick={() => void loadOutage()}
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

        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {audits.length === 0 ? (
            <div style={{ color: "#6b7280", fontSize: 13 }}>No audit records.</div>
          ) : (
            audits.map((a) => (
              <div
                key={a.id}
                style={{ padding: 10, border: "1px solid #f3f4f6", borderRadius: 10, background: "#fff" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontWeight: 800 }}>{a.action}</div>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>{formatDateTime(a.createdAt)}</div>
                </div>
                <div style={{ marginTop: 6, color: "#6b7280", fontSize: 12 }}>Actor: {a.actorUserId}</div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
