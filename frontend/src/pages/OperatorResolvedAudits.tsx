import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Outage, OutageAudit } from "@smartoutage/shared";
import { OutageSeverity } from "@smartoutage/shared";
import { useAuth } from "../auth/AuthContext";
import { downloadResolvedOutageAuditsCsv, getOutageDetail, listResolvedOutages } from "../api/outages";

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatDateForInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // "YYYY-MM-DD"
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfDayIsoWithOffset(dateStr: string): string {
  // dateStr: YYYY-MM-DD in local time -> ISO-like with offset (e.g. 2026-05-28T00:00:00-07:00)
  const [y, m, d] = dateStr.split("-").map((x) => Number(x));
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  return toIsoWithOffset(dt);
}

function endOfDayIsoWithOffset(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map((x) => Number(x));
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999);
  return toIsoWithOffset(dt);
}

function toIsoWithOffset(dt: Date): string {
  // We intentionally include an offset (not "Z") to satisfy backend zod datetime({ offset: true }).
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = dt.getFullYear();
  const mo = pad(dt.getMonth() + 1);
  const da = pad(dt.getDate());
  const hh = pad(dt.getHours());
  const mi = pad(dt.getMinutes());
  const ss = pad(dt.getSeconds());

  const offsetMin = -dt.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const offH = pad(Math.floor(abs / 60));
  const offM = pad(abs % 60);

  // seconds precision is sufficient for filters
  return `${y}-${mo}-${da}T${hh}:${mi}:${ss}${sign}${offH}:${offM}`;
}

function severityLabel(sev: OutageSeverity): string {
  if (sev === OutageSeverity.CRITICAL) return "Critical";
  if (sev === OutageSeverity.HIGH) return "High";
  if (sev === OutageSeverity.MEDIUM) return "Medium";
  return "Low";
}

function severityColors(sev: OutageSeverity): { bg: string; fg: string; border: string } {
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // allow the click to complete before revoking
  setTimeout(() => URL.revokeObjectURL(url), 250);
}

function auditsSummary(audits: OutageAudit[]): string {
  if (!audits.length) return "No audits";
  const last = audits[audits.length - 1]!;
  return `${audits.length} events · last: ${last.action}`;
}

export function OperatorResolvedAudits() {
  const { accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [resolvedOutages, setResolvedOutages] = useState<Outage[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedOutageId, setSelectedOutageId] = useState<string | null>(searchParams.get("outageId"));
  const [detail, setDetail] = useState<{ outage: Outage; audits: OutageAudit[] } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [fromDate, setFromDate] = useState<string>(searchParams.get("from") || "");
  const [toDate, setToDate] = useState<string>(searchParams.get("to") || "");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const filters = useMemo(() => {
    const from = fromDate ? startOfDayIsoWithOffset(fromDate) : undefined;
    const to = toDate ? endOfDayIsoWithOffset(toDate) : undefined;
    return { from, to };
  }, [fromDate, toDate]);

  async function loadResolvedList() {
    if (!accessToken) return;
    setLoadingList(true);
    setListError(null);
    try {
      const res = await listResolvedOutages(accessToken, { limit: 200, offset: 0 });
      setResolvedOutages(res.outages);
    } catch (e) {
      setListError((e as Error).message);
    } finally {
      setLoadingList(false);
    }
  }

  async function loadDetail(outageId: string) {
    if (!accessToken) return;
    setLoadingDetail(true);
    setDetailError(null);
    setDetail(null);
    try {
      const res = await getOutageDetail(accessToken, outageId);
      setDetail({ outage: res.outage, audits: res.audits });
    } catch (e) {
      setDetailError((e as Error).message);
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => {
    void loadResolvedList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    // keep querystring in sync for shareable filtered view
    const next = new URLSearchParams(searchParams);
    if (selectedOutageId) next.set("outageId", selectedOutageId);
    else next.delete("outageId");
    if (fromDate) next.set("from", fromDate);
    else next.delete("from");
    if (toDate) next.set("to", toDate);
    else next.delete("to");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOutageId, fromDate, toDate]);

  useEffect(() => {
    if (!selectedOutageId) return;
    void loadDetail(selectedOutageId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, selectedOutageId]);

  async function onDownloadCsv() {
    if (!accessToken) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const { blob, filename } = await downloadResolvedOutageAuditsCsv(accessToken, filters);
      downloadBlob(blob, filename);
    } catch (e) {
      setDownloadError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <h2 style={{ margin: 0 }}>Resolution Audit</h2>
        <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
          Review resolved outages and their audit trail. Export resolved audit data as CSV.
        </div>
      </div>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700 }}>Export (CSV)</div>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "#374151" }}>From (resolved date)</div>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "#374151" }}>To (resolved date)</div>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db" }}
              />
            </label>

            <button
              onClick={() => void onDownloadCsv()}
              disabled={downloading}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #111827",
                background: "#111827",
                color: "#fff",
                cursor: downloading ? "not-allowed" : "pointer",
                fontWeight: 700,
                height: 40
              }}
              title="Download resolved outage audits CSV"
            >
              {downloading ? "Preparing…" : "Download CSV"}
            </button>
          </div>
        </div>

        {downloadError ? (
          <div
            role="alert"
            style={{
              marginTop: 10,
              color: "#991b1b",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              padding: 10,
              borderRadius: 8,
              fontSize: 13
            }}
          >
            {downloadError}
          </div>
        ) : (
          <div style={{ marginTop: 10, color: "#6b7280", fontSize: 12 }}>
            Filters apply to <code>outage.resolvedAt</code>. Leave blank to export all resolved audits.
          </div>
        )}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 14, alignItems: "start" }}>
        {/* Resolved list */}
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontWeight: 700 }}>Resolved outages</div>
            <button
              onClick={() => void loadResolvedList()}
              disabled={loadingList}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                cursor: loadingList ? "not-allowed" : "pointer"
              }}
              title="Refresh from API"
            >
              {loadingList ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {listError ? (
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
              {listError}
            </div>
          ) : null}

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ padding: "10px 8px" }}>Location</th>
                  <th style={{ padding: "10px 8px" }}>Severity</th>
                  <th style={{ padding: "10px 8px" }}>Resolved</th>
                  <th style={{ padding: "10px 8px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingList ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 12, color: "#6b7280" }}>
                      Loading resolved outages…
                    </td>
                  </tr>
                ) : resolvedOutages.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 12, color: "#6b7280" }}>
                      No resolved outages found.
                    </td>
                  </tr>
                ) : (
                  resolvedOutages.map((o) => {
                    const c = severityColors(o.severity);
                    const isSelected = o.id === selectedOutageId;
                    return (
                      <tr key={o.id} style={{ borderBottom: "1px solid #f3f4f6", background: isSelected ? "#F9FAFB" : undefined }}>
                        <td style={{ padding: "10px 8px", fontWeight: 700 }}>{o.location}</td>
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
                              fontWeight: 800,
                              fontSize: 12
                            }}
                            title={`Severity: ${o.severity}`}
                          >
                            {severityLabel(o.severity)}
                          </span>
                        </td>
                        <td style={{ padding: "10px 8px", color: "#374151" }}>{formatDateTime(o.resolvedAt)}</td>
                        <td style={{ padding: "10px 8px" }}>
                          <button
                            onClick={() => setSelectedOutageId(o.id)}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1px solid #111827",
                              background: "#fff",
                              cursor: "pointer",
                              fontWeight: 700
                            }}
                          >
                            View audit
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

        {/* Detail */}
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontWeight: 700 }}>Audit detail</div>
            {selectedOutageId ? (
              <Link to={`/operator/outages/${selectedOutageId}`} style={{ fontSize: 13 }}>
                Open outage detail →
              </Link>
            ) : null}
          </div>

          {!selectedOutageId ? (
            <div style={{ marginTop: 12, color: "#6b7280", fontSize: 13 }}>Select a resolved outage to view its audit trail.</div>
          ) : loadingDetail ? (
            <div style={{ marginTop: 12, color: "#6b7280", fontSize: 13 }}>Loading audit…</div>
          ) : detailError ? (
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
              {detailError}
            </div>
          ) : detail ? (
            <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
              <div style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff" }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Outage</div>
                <div style={{ fontWeight: 800, marginTop: 4 }}>{detail.outage.location}</div>
                <div style={{ color: "#374151", marginTop: 2 }}>{detail.outage.faultType}</div>
                <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
                  Created: {formatDateTime(detail.outage.createdAt)} · Resolved: {formatDateTime(detail.outage.resolvedAt)}
                </div>
                <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>Audit: {auditsSummary(detail.audits)}</div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ padding: "10px 8px" }}>Time</th>
                      <th style={{ padding: "10px 8px" }}>Action</th>
                      <th style={{ padding: "10px 8px" }}>Actor</th>
                      <th style={{ padding: "10px 8px" }}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.audits.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: 12, color: "#6b7280" }}>
                          No audit events.
                        </td>
                      </tr>
                    ) : (
                      detail.audits.map((a) => (
                        <tr key={a.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                          <td style={{ padding: "10px 8px", color: "#374151", whiteSpace: "nowrap" }}>{formatDateTime(a.createdAt)}</td>
                          <td style={{ padding: "10px 8px", fontWeight: 700 }}>{a.action}</td>
                          <td style={{ padding: "10px 8px", color: "#374151", whiteSpace: "nowrap" }}>{a.actorUserId}</td>
                          <td style={{ padding: "10px 8px", color: "#374151" }}>
                            <pre
                              style={{
                                margin: 0,
                                fontSize: 12,
                                background: "#F9FAFB",
                                border: "1px solid #E5E7EB",
                                borderRadius: 8,
                                padding: 8,
                                overflowX: "auto",
                                maxWidth: 520
                              }}
                            >
                              {JSON.stringify(a.details ?? {}, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, background: "#F9FAFB" }}>
        <div style={{ fontWeight: 800 }}>Notes</div>
        <ul style={{ margin: "8px 0 0 18px", color: "#374151", fontSize: 13, lineHeight: 1.6 }}>
          <li>
            CSV export is generated by the backend endpoint <code>/api/audits/export.csv</code>.
          </li>
          <li>
            Resolved outages list is loaded from <code>/api/outages/resolved</code>. Audit detail uses <code>/api/outages/:id</code>.
          </li>
        </ul>
      </section>
    </div>
  );
}
