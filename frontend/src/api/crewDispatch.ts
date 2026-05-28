import { apiFetch } from "./client";
import type {
  AssignCrewRequest,
  AssignCrewResponse,
  ListAvailableCrewResponse,
  ListMyJobsResponse,
  UpdateJobStatusRequest,
  UpdateJobStatusResponse
} from "@smartoutage/shared";

// PUBLIC_INTERFACE
export async function listAvailableCrew(accessToken: string): Promise<ListAvailableCrewResponse> {
  /**
   * Calls backend GET /api/crew to list available crew members (operator-only).
   */
  const res = await apiFetch("/api/crew", {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!res.ok) {
    let message = "Failed to load available crew";
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
export async function assignCrewToOutage(
  accessToken: string,
  outageId: string,
  body: AssignCrewRequest
): Promise<AssignCrewResponse> {
  /**
   * Calls backend POST /api/outages/:id/assign to create a job assignment (operator-only).
   */
  const res = await apiFetch(`/api/outages/${encodeURIComponent(outageId)}/assign`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    let message = "Failed to assign crew";
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
export async function listMyJobs(accessToken: string): Promise<ListMyJobsResponse> {
  /**
   * Calls backend GET /api/crew/jobs to list jobs assigned to the logged-in crew member (crew-only).
   */
  const res = await apiFetch("/api/crew/jobs", {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!res.ok) {
    let message = "Failed to load jobs";
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
export async function updateJobStatus(
  accessToken: string,
  jobId: string,
  body: UpdateJobStatusRequest
): Promise<UpdateJobStatusResponse> {
  /**
   * Calls backend PATCH /api/jobs/:id/status to update a job status (crew-only).
   */
  const res = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/status`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    let message = "Failed to update job status";
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
