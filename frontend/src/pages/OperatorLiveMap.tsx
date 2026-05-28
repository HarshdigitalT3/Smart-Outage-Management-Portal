import React, { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, InfoWindow, LoadScript, MarkerF } from "@react-google-maps/api";
import { OutageSeverity } from "@smartoutage/shared";
import type { OutageEvent, OutageMapPoint, OutageSeverity as Sev } from "@smartoutage/shared";
import { useAuth } from "../auth/AuthContext";
import { listActiveOutagesMapPoints } from "../api/outages";
import { subscribeToOutageEvents } from "../realtime/outagesWs";

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "loaded" };

function severityLabel(sev: Sev): string {
  if (sev === OutageSeverity.CRITICAL) return "Critical";
  if (sev === OutageSeverity.HIGH) return "High";
  if (sev === OutageSeverity.MEDIUM) return "Medium";
  return "Low";
}

function severityColor(sev: Sev): string {
  // Marker pin color (Google default red replaced by custom SVG icon fill)
  switch (sev) {
    case OutageSeverity.CRITICAL:
      return "#DC2626"; // red
    case OutageSeverity.HIGH:
      return "#EA580C"; // orange
    case OutageSeverity.MEDIUM:
      return "#D97706"; // amber
    case OutageSeverity.LOW:
    default:
      return "#16A34A"; // green
  }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

/**
 * Produces a colored "pin" icon using an inline SVG. This avoids additional image assets
 * and works well with MarkerF icon URLs.
 */
function markerIconUrl(color: string): string {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="54" viewBox="0 0 24 34">
  <path d="M12 0C6.48 0 2 4.48 2 10c0 7.5 10 24 10 24s10-16.5 10-24C22 4.48 17.52 0 12 0z" fill="${color}"/>
  <circle cx="12" cy="10" r="4" fill="white" opacity="0.95"/>
</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.trim())}`;
}

function computeCenter(points: OutageMapPoint[]): google.maps.LatLngLiteral {
  // If we have points, center on their average; otherwise default to the same general
  // service area bounding box used server-side (roughly Bay Area).
  if (!points.length) return { lat: 37.65, lng: -122.15 };

  const sum = points.reduce(
    (acc, p) => {
      acc.lat += p.lat;
      acc.lng += p.lng;
      return acc;
    },
    { lat: 0, lng: 0 }
  );

  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

export function OperatorLiveMap() {
  const { accessToken } = useAuth();

  const [wsConnected, setWsConnected] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [points, setPoints] = useState<OutageMapPoint[]>([]);
  const [selected, setSelected] = useState<OutageMapPoint | null>(null);

  const center = useMemo(() => computeCenter(points), [points]);

  async function loadSnapshot() {
    if (!accessToken) return;
    setLoadState({ status: "loading" });
    try {
      const res = await listActiveOutagesMapPoints(accessToken);
      setPoints(res.points);
      setLoadState({ status: "loaded" });
    } catch (e) {
      setLoadState({ status: "error", message: (e as Error).message });
    }
  }

  useEffect(() => {
    void loadSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Realtime: when backend emits outages_map_updated, replace our point set.
  // Also: for other outage events, fallback to reloading snapshot (keeps map correct even if
  // a future backend version stops emitting outages_map_updated for some action).
  const subRef = useRef<{ close: () => void } | null>(null);
  useEffect(() => {
    if (!accessToken) return;

    subRef.current?.close();
    subRef.current = subscribeToOutageEvents({
      accessToken,
      onConnectionChange: setWsConnected,
      onEvent: (event: OutageEvent) => {
        if (event.type === "outages_map_updated") {
          setPoints(event.points);
          setLoadState({ status: "loaded" });
          // If selected outage disappeared (resolved), close popup.
          setSelected((prev) => (prev && event.points.some((p) => p.outageId === prev.outageId) ? prev : null));
          return;
        }

        // Conservative fallback: refresh snapshot.
        // Avoid spamming by only doing it when we are already loaded at least once.
        if (loadState.status === "loaded") void loadSnapshot();
      },
      onError: () => {
        // Silent: map still works via manual refresh and initial load.
      }
    });

    return () => {
      subRef.current?.close();
      subRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? "";

  const mapContainerStyle: React.CSSProperties = {
    width: "100%",
    height: "540px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    overflow: "hidden"
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Live Outage Map</h2>
          <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
            Realtime view of active outages.
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
          onClick={() => void loadSnapshot()}
          disabled={loadState.status === "loading"}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#fff",
            cursor: loadState.status === "loading" ? "not-allowed" : "pointer",
            height: 36
          }}
          title="Refresh from API"
        >
          {loadState.status === "loading" ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loadState.status === "error" ? (
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
          {loadState.message}
        </div>
      ) : null}

      {/* Configuration help (API key required for Google Maps) */}
      {!apiKey ? (
        <div
          role="alert"
          style={{
            color: "#92400E",
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            padding: 10,
            borderRadius: 8,
            fontSize: 13
          }}
        >
          Google Maps is not configured. Set <code>VITE_GOOGLE_MAPS_API_KEY</code> in the frontend environment to enable
          the live map. (The rest of the operator dashboard still works.)
        </div>
      ) : null}

      {apiKey ? (
        <LoadScript googleMapsApiKey={apiKey}>
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={center}
            zoom={points.length ? 11 : 10}
            options={{
              streetViewControl: false,
              mapTypeControl: false,
              fullscreenControl: true
            }}
            onClick={() => setSelected(null)}
          >
            {points.map((p) => (
              <MarkerF
                key={p.outageId}
                position={{ lat: p.lat, lng: p.lng }}
                onClick={() => setSelected(p)}
                title={`${severityLabel(p.severity)} • ${p.locationLabel}`}
                icon={{
                  url: markerIconUrl(severityColor(p.severity)),
                  scaledSize: new google.maps.Size(32, 44),
                  anchor: new google.maps.Point(16, 44)
                }}
              />
            ))}

            {selected ? (
              <InfoWindow position={{ lat: selected.lat, lng: selected.lng }} onCloseClick={() => setSelected(null)}>
                <div style={{ maxWidth: 260 }}>
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>{selected.locationLabel}</div>
                  <div style={{ fontSize: 13, color: "#374151" }}>
                    Severity: <b>{severityLabel(selected.severity)}</b>
                  </div>
                  <div style={{ fontSize: 13, color: "#374151" }}>Affected customers: {selected.affectedCustomers}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                    Updated: {formatDateTime(selected.updatedAt)}
                  </div>
                </div>
              </InfoWindow>
            ) : null}
          </GoogleMap>
        </LoadScript>
      ) : (
        <div style={{ ...mapContainerStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: "#6b7280", fontSize: 13, padding: 16, textAlign: "center" }}>
            Map unavailable until Google Maps API key is configured.
          </div>
        </div>
      )}

      {/* Fallback message when there are no active outages */}
      {loadState.status !== "loading" && points.length === 0 ? (
        <div
          style={{
            color: "#6b7280",
            fontSize: 13,
            border: "1px dashed #d1d5db",
            borderRadius: 10,
            padding: 12
          }}
        >
          No active outages to display on the map.
        </div>
      ) : null}
    </div>
  );
}
