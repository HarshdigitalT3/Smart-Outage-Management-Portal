import { apiFetch } from "./client";
import type {
  CreateOutageRequest,
  CreateOutageResponse,
  GetOutageDetailResponse,
  ListActiveOutagesResponse,
  ListActiveOutagesMapResponse,
  Outage,
  ResolveOutageResponse,
  UpdateOutageStatusRequest,
  UpdateOutageStatusResponse
} from "@smartoutage/shared";

type ListResolvedOutagesResponse = { outages: Outage[] };

// PUBLIC_INTERFACE
export async function createOutage(accessToken: string, body: CreateOutageRequest): Promise<CreateOutageResponse> {
  /**
   * Calls backend POST /api/outages to create a new outage.
   */
  const res = await apiFetch("/api/outages", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    let message = "Failed to create outage";
    try {
      const data = (await res.json()) as any;
      message = data?.error?.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json();
}

// PUBLIC_INTERFACE
export async function listActiveOutages(accessToken: string): Promise<ListActiveOutagesResponse> {
  /**
   * Calls backend GET /api/outages to list all non-resolved outages.
   */
  const res = await apiFetch("/api/outages", {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!res.ok) {
    let message = "Failed to load outages";
    try {
      const data = (await res.json()) as any;
      message = data?.error?.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json();
}

// PUBLIC_INTERFACE
export async function getOutageDetail(accessToken: string, outageId: string): Promise<GetOutageDetailResponse> {
  /**
   * Calls backend GET /api/outages/:id to retrieve a single outage and its audits.
   */
  const res = await apiFetch(`/api/outages/${encodeURIComponent(outageId)}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!res.ok) {
    let message = "Failed to load outage detail";
    try {
      const data = (await res.json()) as any;
      message = data?.error?.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json();
}

// PUBLIC_INTERFACE
export async function updateOutageStatus(
  accessToken: string,
  outageId: string,
  body: UpdateOutageStatusRequest
): Promise<UpdateOutageStatusResponse> {
  /**
   * Calls backend PATCH /api/outages/:id/status to update outage status.
   */
  const res = await apiFetch(`/api/outages/${encodeURIComponent(outageId)}/status`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    let message = "Failed to update status";
    try {
      const data = (await res.json()) as any;
      message = data?.error?.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json();
}

// PUBLIC_INTERFACE
export async function resolveOutage(accessToken: string, outageId: string): Promise<ResolveOutageResponse> {
  /**
   * Calls backend POST /api/outages/:id/resolve to resolve an outage (and generate audit).
   */
  const res = await apiFetch(`/api/outages/${encodeURIComponent(outageId)}/resolve`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!res.ok) {
    let message = "Failed to resolve outage";
    try {
      const data = (await res.json()) as any;
      message = data?.error?.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json();
}

// PUBLIC_INTERFACE
export async function listActiveOutagesMapPoints(accessToken: string): Promise<ListActiveOutagesMapResponse> {
  /**
   * Calls backend GET /api/outages/map to list all active outages as map points (lat/lng + severity).
   */
  const res = await apiFetch("/api/outages/map", {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!res.ok) {
    let message = "Failed to load outage map";
    try {
      const data = (await res.json()) as any;
      message = data?.error?.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json();
}

// PUBLIC_INTERFACE
export async function listResolvedOutages(
  accessToken: string,
  params?: { limit?: number; offset?: number }
): Promise<ListResolvedOutagesResponse> {
  /**
   * Calls backend GET /api/outages/resolved to list resolved outages (history).
   */
  const qs = new URLSearchParams();
  if (params?.limit !== undefined) qs.set("limit", String(params.limit));
  if (params?.offset !== undefined) qs.set("offset", String(params.offset));

  const res = await apiFetch(`/api/outages/resolved${qs.toString() ? `?${qs.toString()}` : ""}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!res.ok) {
    let message = "Failed to load resolved outages";
    try {
      const data = (await res.json()) as any;
      message = data?.error?.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json();
}

// PUBLIC_INTERFACE
export async function downloadResolvedOutageAuditsCsv(
  accessToken: string,
  params?: { from?: string; to?: string }
): Promise<{ blob: Blob; filename: string }> {
  /**
   * Calls backend GET /api/audits/export.csv and returns a Blob + best-effort filename.
   *
   * Note: apiFetch forces JSON content-type. This endpoint returns text/csv, so we call fetch directly.
   */
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!API_BASE_URL) throw new Error("VITE_API_BASE_URL is not set");

  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);

  const url = `${API_BASE_URL}/api/audits/export.csv${qs.toString() ? `?${qs.toString()}` : ""}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!res.ok) {
    let message = "Failed to download CSV export";
    try {
      const data = (await res.json()) as any;
      message = data?.error?.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const cd = res.headers.get("content-disposition") || "";
  const match = /filename="([^"]+)"/i.exec(cd);
  const filename = match?.[1] || "resolved-outage-audits.csv";
  const blob = await res.blob();
  return { blob, filename };
}
