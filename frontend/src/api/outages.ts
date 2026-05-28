import { apiFetch } from "./client";
import type {
  CreateOutageRequest,
  CreateOutageResponse,
  GetOutageDetailResponse,
  ListActiveOutagesResponse,
  ResolveOutageResponse,
  UpdateOutageStatusRequest,
  UpdateOutageStatusResponse
} from "@smartoutage/shared";

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
