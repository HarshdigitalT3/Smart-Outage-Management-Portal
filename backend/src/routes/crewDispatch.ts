import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { Roles, JobStatus } from "@smartoutage/shared";
import type {
  AssignCrewRequest,
  AssignCrewResponse,
  ListAvailableCrewResponse,
  ListMyJobsResponse,
  UpdateJobStatusRequest,
  UpdateJobStatusResponse
} from "@smartoutage/shared";
import { wsHub } from "../singleton/ws.js";
import { pool } from "../db/pool.js";
import { assignCrewToOutage, getJobById, listAvailableCrew, listJobsForCrewUser, updateJobStatus } from "../db/crewDispatch.js";

export const crewDispatchRouter = Router();

const assignSchema = z.object({
  crewUserId: z.string().uuid(),
  safetyNotes: z.string().optional()
});

const updateJobStatusSchema = z.object({
  status: z.enum([JobStatus.EN_ROUTE, JobStatus.ON_SITE, JobStatus.RESOLVED])
});

/**
 * Crew dispatch APIs:
 * - Operator:
 *   - GET /crew (available crew)
 *   - POST /outages/:id/assign (assign crew to outage -> creates job card)
 * - Crew:
 *   - GET /crew/jobs (my jobs)
 *   - PATCH /jobs/:id/status (update status; en_route -> on_site -> resolved)
 */

// Operator-only: list available crew
crewDispatchRouter.get(
  "/crew",
  requireAuth,
  requireRole(Roles.OPERATOR),
  asyncHandler(async (_req, res) => {
    /**
     * Lists available field crew (derived from crews without any active job).
     *
     * Returns: { crew: CrewMember[] }
     */
    const crew = await listAvailableCrew();
    const payload: ListAvailableCrewResponse = { crew };
    res.json(payload);
  })
);

// Operator-only: assign crew to outage (creates job)
crewDispatchRouter.post(
  "/outages/:id/assign",
  requireAuth,
  requireRole(Roles.OPERATOR),
  asyncHandler(async (req, res) => {
    /**
     * Assigns a crew member to an outage by creating a job card.
     *
     * Path params:
     * - id: outage id
     *
     * Body:
     * - crewUserId (uuid, required): app_users.id of the crew member
     * - safetyNotes (string, optional)
     *
     * Returns: { job }
     *
     * Real-time:
     * - broadcasts { type: 'job_assigned', job } so crew job list updates immediately
     */
    const outageId = req.params.id;
    const body: AssignCrewRequest = assignSchema.parse(req.body);

    // Create job id
    const idRes = await pool.query<{ id: string }>(`SELECT gen_random_uuid() AS id`);
    const jobId = idRes.rows[0]!.id;

    try {
      const job = await assignCrewToOutage({
        jobId,
        outageId,
        crewUserId: body.crewUserId,
        safetyNotes: (body.safetyNotes ?? "").trim(),
        createdBy: req.user!.id
      });

      wsHub.broadcast({ type: "job_assigned", job });

      const payload: AssignCrewResponse = { job };
      res.status(201).json(payload);
    } catch (e: any) {
      // Unique constraint uq_app_jobs_outage_active will throw on double-assign.
      // Provide a friendly 409 for operator UX.
      const message = typeof e?.message === "string" ? e.message : "";
      if (message.includes("uq_app_jobs_outage_active") || message.toLowerCase().includes("duplicate key")) {
        return res.status(409).json({ error: { message: "Outage already has an active job assignment", status: 409 } });
      }
      throw e;
    }
  })
);

// Crew-only: list jobs assigned to me
crewDispatchRouter.get(
  "/crew/jobs",
  requireAuth,
  requireRole(Roles.CREW),
  asyncHandler(async (req, res) => {
    /**
     * Lists jobs assigned to the logged-in crew member.
     *
     * Returns: { jobs }
     */
    const jobs = await listJobsForCrewUser(req.user!.id);
    const payload: ListMyJobsResponse = { jobs };
    res.json(payload);
  })
);

// Crew-only: update job status
crewDispatchRouter.patch(
  "/jobs/:id/status",
  requireAuth,
  requireRole(Roles.CREW),
  asyncHandler(async (req, res) => {
    /**
     * Updates job status for a job assigned to the logged-in crew member.
     *
     * Allowed transitions (client-guided):
     * - assigned -> en_route
     * - en_route -> on_site
     * - on_site -> resolved
     *
     * Body:
     * - status: en_route | on_site | resolved
     *
     * Returns: { job }
     *
     * Real-time:
     * - broadcasts { type: 'job_status_updated', job } so operator dashboards reflect changes immediately
     */
    const jobId = req.params.id;
    const body: UpdateJobStatusRequest = updateJobStatusSchema.parse(req.body);

    const existing = await getJobById(jobId);
    if (!existing) return res.status(404).json({ error: { message: "Job not found", status: 404 } });

    // Enforce ownership: crew can only update their own job.
    if (existing.crewUserId !== req.user!.id) {
      return res.status(403).json({ error: { message: "Forbidden", status: 403 } });
    }

    // Enforce forward-only transitions server-side.
    const order: Record<string, number> = {
      assigned: 0,
      en_route: 1,
      on_site: 2,
      resolved: 3
    };
    if (order[body.status] < order[existing.status]) {
      return res.status(400).json({ error: { message: "Invalid status transition", status: 400 } });
    }
    if (existing.status === "resolved") {
      return res.status(400).json({ error: { message: "Job is already resolved", status: 400 } });
    }

    const resolvedAt = body.status === JobStatus.RESOLVED ? new Date() : null;
    const updated = await updateJobStatus({ jobId, status: body.status, resolvedAt });
    if (!updated) return res.status(404).json({ error: { message: "Job not found", status: 404 } });

    wsHub.broadcast({ type: "job_status_updated", job: updated });

    const payload: UpdateJobStatusResponse = { job: updated };
    res.json(payload);
  })
);
