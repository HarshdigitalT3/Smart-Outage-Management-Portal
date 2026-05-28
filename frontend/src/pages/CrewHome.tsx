import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CrewDispatchEvent, JobCard, JobCardWithOutage, JobStatus } from "@smartoutage/shared";
import { JobStatus as JobStatuses } from "@smartoutage/shared";
import { useAuth } from "../auth/AuthContext";
import { listMyJobs, updateJobStatus } from "../api/crewDispatch";
import { subscribeToCrewDispatchEvents } from "../realtime/crewDispatchWs";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function statusLabel(status: JobStatus): string {
  if (status === JobStatuses.ASSIGNED) return "Assigned";
  if (status === JobStatuses.EN_ROUTE) return "En Route";
  if (status === JobStatuses.ON_SITE) return "On Site";
  if (status === JobStatuses.RESOLVED) return "Resolved";
  return status;
}

function statusColors(status: JobStatus): { bg: string; fg: string; border: string } {
  switch (status) {
    case JobStatuses.ASSIGNED:
      return { bg: "#EFF6FF", fg: "#1D4ED8", border: "#BFDBFE" };
    case JobStatuses.EN_ROUTE:
      return { bg: "#FFFBEB", fg: "#92400E", border: "#FDE68A" };
    case JobStatuses.ON_SITE:
      return { bg: "#ECFDF5", fg: "#065F46", border: "#A7F3D0" };
    case JobStatuses.RESOLVED:
      return { bg: "#F3F4F6", fg: "#374151", border: "#E5E7EB" };
    default:
      return { bg: "#F3F4F6", fg: "#374151", border: "#E5E7EB" };
  }
}

function nextStatus(current: JobStatus): JobStatus | null {
  if (current === JobStatuses.ASSIGNED) return JobStatuses.EN_ROUTE;
  if (current === JobStatuses.EN_ROUTE) return JobStatuses.ON_SITE;
  if (current === JobStatuses.ON_SITE) return JobStatuses.RESOLVED;
  return null;
}

function upsertJob(list: JobCardWithOutage[], job: JobCard): JobCardWithOutage[] {
  const idx = list.findIndex((j) => j.id === job.id);
  if (idx === -1) {
    // If we don't have outage payload, keep it off-list until a refresh (should be rare).
    return list;
  }
  const copy = list.slice();
  copy[idx] = { ...copy[idx], ...job };
  return copy;
}

function removeJob(list: JobCardWithOutage[], jobId: string): JobCardWithOutage[] {
  return list.filter((j) => j.id !== jobId);
}

export function CrewHome() {
  const { accessToken, user } = useAuth();

  const [jobs, setJobs] = useState<JobCardWithOutage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [wsConnected, setWsConnected] = useState(false);

  // "Mobile" split view: list + optional detail panel. On narrow screens, this behaves like navigating between panels.
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const selectedJob = useMemo(() => jobs.find((j) => j.id === selectedJobId) ?? null, [jobs, selectedJobId]);

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  async function load() {
    if (!accessToken) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listMyJobs(accessToken);
      setJobs(res.jobs);
      // Default select first active job if nothing selected.
      setSelectedJobId((prev) => prev ?? res.jobs[0]?.id ?? null);
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

  // Realtime: update job list when operator assigns a job, or when status updates happen.
  const subRef = useRef<{ close: () => void } | null>(null);
  useEffect(() => {
    if (!accessToken) return;

    subRef.current?.close();
    subRef.current = subscribeToCrewDispatchEvents({
      accessToken,
      onConnectionChange: setWsConnected,
      onEvent: (event: CrewDispatchEvent) => {
        if (event.type === "job_assigned") {
          // Only show if this job belongs to me.
          if (event.job.crewUserId !== user?.id) return;
          // We need outage details (JobCardWithOutage) for the list, so do a targeted reload.
          void load();
          return;
        }

        if (event.type === "job_status_updated") {
          // Only update if this is a job we already have.
          setJobs((prev) => {
            const next = upsertJob(prev, event.job);
            // If resolved, keep it visible but push it down; simplest is full reload later via manual refresh.
            return next;
          });
        }
      },
      onError: () => {
        // Non-fatal.
      }
    });

    return () => {
      subRef.current?.close();
      subRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, user?.id]);

  async function onAdvanceStatus() {
    if (!accessToken) return;
    if (!selectedJob) return;

    setStatusError(null);

    const desired = nextStatus(selectedJob.status);
    if (!desired) return;

    setUpdatingStatus(true);
    try {
      const res = await updateJobStatus(accessToken, selectedJob.id, { status: desired });
      // Optimistic update: operator will also see this immediately via WS broadcast.
      setJobs((prev) => {
        const next = upsertJob(prev, res.job);
        // If resolved, you may want to remove it from the "active" list; for now keep it but mark resolved.
        return next;
      });
    } catch (e) {
      setStatusError((e as Error).message);
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function onMarkResolvedNow() {
    if (!accessToken) return;
    if (!selectedJob) return;

    setStatusError(null);
    if (selectedJob.status === JobStatuses.RESOLVED) return;

    setUpdatingStatus(true);
    try {
      const res = await updateJobStatus(accessToken, selectedJob.id, { status: JobStatuses.RESOLVED });
      setJobs((prev) => upsertJob(prev, res.job));
    } catch (e) {
      setStatusError((e as Error).message);
    } finally {
      setUpdatingStatus(false);
    }
  }

  const isMobileTwoPane = true;

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>My Jobs</h2>
          <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
            Tap a job to view details and update status.
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
          onClick={() => void load()}
          disabled={loading}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
            background: "#fff",
            cursor: loading ? "not-allowed" : "pointer",
            height: 44
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
            color: "#991b1b",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            padding: 10,
            borderRadius: 10
          }}
        >
          {loadError}
        </div>
      ) : null}

      {/* Mobile-optimized split layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobileTwoPane ? "1fr 1.2fr" : "1fr",
          gap: 14,
          alignItems: "start"
        }}
      >
        {/* Job list */}
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Assigned jobs</div>

          {loading ? (
            <div style={{ color: "#6b7280", fontSize: 13, padding: 8 }}>Loading jobs…</div>
          ) : jobs.length === 0 ? (
            <div style={{ color: "#6b7280", fontSize: 13, padding: 8 }}>No assigned jobs yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {jobs.map((j) => {
                const isSelected = j.id === selectedJobId;
                const c = statusColors(j.status);
                return (
                  <button
                    key={j.id}
                    onClick={() => setSelectedJobId(j.id)}
                    style={{
                      textAlign: "left",
                      borderRadius: 12,
                      border: isSelected ? "2px solid #111827" : "1px solid #e5e7eb",
                      background: isSelected ? "#F9FAFB" : "#fff",
                      padding: 12,
                      cursor: "pointer"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 900 }}>{j.outage.location}</div>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "4px 10px",
                          borderRadius: 999,
                          border: `1px solid ${c.border}`,
                          background: c.bg,
                          color: c.fg,
                          fontWeight: 900,
                          fontSize: 12
                        }}
                      >
                        {statusLabel(j.status)}
                      </span>
                    </div>
                    <div style={{ marginTop: 6, color: "#374151", fontSize: 13 }}>{j.outage.faultType}</div>
                    <div style={{ marginTop: 6, color: "#6b7280", fontSize: 12 }}>
                      Affected: {j.outage.affectedCustomers} · Updated: {formatDateTime(j.updatedAt)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Job detail card */}
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Job card</div>

          {!selectedJob ? (
            <div style={{ color: "#6b7280", fontSize: 13, padding: 8 }}>Select a job to see details.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ padding: 12, borderRadius: 12, border: "1px solid #f3f4f6", background: "#F9FAFB" }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Location</div>
                <div style={{ fontWeight: 900, fontSize: 18, marginTop: 2 }}>{selectedJob.outage.location}</div>
                <div style={{ marginTop: 6, color: "#374151" }}>
                  <span style={{ fontWeight: 800 }}>Fault:</span> {selectedJob.outage.faultType}
                </div>
                <div style={{ marginTop: 4, color: "#374151" }}>
                  <span style={{ fontWeight: 800 }}>Affected customers:</span> {selectedJob.outage.affectedCustomers}
                </div>
              </div>

              <div style={{ padding: 12, borderRadius: 12, border: "1px solid #e5e7eb" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Status</div>
                    <div style={{ fontWeight: 900, marginTop: 2 }}>{statusLabel(selectedJob.status)}</div>
                  </div>
                  <div style={{ color: "#6b7280", fontSize: 12, textAlign: "right" }}>
                    Updated
                    <br />
                    {formatDateTime(selectedJob.updatedAt)}
                  </div>
                </div>

                {selectedJob.safetyNotes?.trim() ? (
                  <div style={{ marginTop: 12, padding: 10, borderRadius: 12, background: "#FFF7ED", border: "1px solid #FED7AA" }}>
                    <div style={{ fontSize: 12, color: "#9A3412", fontWeight: 900 }}>Safety notes</div>
                    <div style={{ marginTop: 6, color: "#7C2D12", fontSize: 14 }}>{selectedJob.safetyNotes}</div>
                  </div>
                ) : (
                  <div style={{ marginTop: 12, color: "#6b7280", fontSize: 13 }}>No safety notes provided.</div>
                )}

                {statusError ? (
                  <div
                    role="alert"
                    style={{
                      marginTop: 12,
                      color: "#991b1b",
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      padding: 10,
                      borderRadius: 12,
                      fontSize: 13
                    }}
                  >
                    {statusError}
                  </div>
                ) : null}

                {/* Tap-friendly buttons */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginTop: 14 }}>
                  <button
                    onClick={() => void onAdvanceStatus()}
                    disabled={updatingStatus || nextStatus(selectedJob.status) === null}
                    style={{
                      height: 52,
                      borderRadius: 14,
                      border: "1px solid #111827",
                      background: updatingStatus || nextStatus(selectedJob.status) === null ? "#9CA3AF" : "#111827",
                      color: "#fff",
                      cursor: updatingStatus || nextStatus(selectedJob.status) === null ? "not-allowed" : "pointer",
                      fontWeight: 900,
                      fontSize: 16
                    }}
                  >
                    {updatingStatus
                      ? "Updating…"
                      : nextStatus(selectedJob.status) === JobStatuses.EN_ROUTE
                        ? "Mark En Route"
                        : nextStatus(selectedJob.status) === JobStatuses.ON_SITE
                          ? "Mark On Site"
                          : nextStatus(selectedJob.status) === JobStatuses.RESOLVED
                            ? "Mark Resolved"
                            : "No further actions"}
                  </button>

                  {/* Secondary: direct resolve (useful if you need to skip steps in a demo). */}
                  <button
                    onClick={() => void onMarkResolvedNow()}
                    disabled={updatingStatus || selectedJob.status === JobStatuses.RESOLVED}
                    style={{
                      height: 52,
                      borderRadius: 14,
                      border: "1px solid #dc2626",
                      background: "#fff",
                      color: "#dc2626",
                      cursor: updatingStatus || selectedJob.status === JobStatuses.RESOLVED ? "not-allowed" : "pointer",
                      fontWeight: 900,
                      fontSize: 16
                    }}
                    title="Optional: resolve immediately"
                  >
                    Resolve now
                  </button>
                </div>
              </div>

              {/* Optional: hide resolved jobs button */}
              {selectedJob.status === JobStatuses.RESOLVED ? (
                <button
                  onClick={() => {
                    // Keep UI tidy after resolution.
                    setJobs((prev) => removeJob(prev, selectedJob.id));
                    setSelectedJobId(null);
                  }}
                  style={{
                    height: 44,
                    borderRadius: 12,
                    border: "1px solid #d1d5db",
                    background: "#fff",
                    cursor: "pointer",
                    fontWeight: 800
                  }}
                >
                  Remove from list
                </button>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
