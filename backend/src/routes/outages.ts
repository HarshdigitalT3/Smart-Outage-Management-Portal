import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { Roles, OutageSeverity, OutageStatus } from "@smartoutage/shared";
import type {
  CreateOutageResponse,
  GetOutageDetailResponse,
  ListActiveOutagesResponse,
  ResolveOutageResponse,
  UpdateOutageStatusResponse
} from "@smartoutage/shared";
import { createOutage, getOutageById, insertOutageAudit, listActiveOutages, listAuditsForOutage, updateOutageStatus } from "../db/outages.js";
import { wsHub } from "../singleton/ws.js";

export const outagesRouter = Router();

const createSchema = z.object({
  location: z.string().min(1),
  faultType: z.string().min(1),
  severity: z.enum([OutageSeverity.LOW, OutageSeverity.MEDIUM, OutageSeverity.HIGH, OutageSeverity.CRITICAL]),
  affectedCustomers: z.number().int().min(0)
});

const updateStatusSchema = z.object({
  status: z.enum([
    OutageStatus.NEW,
    OutageStatus.INVESTIGATING,
    OutageStatus.IDENTIFIED,
    OutageStatus.MONITORING,
    OutageStatus.RESOLVED
  ])
});

/**
 * All outage-management endpoints are operator-only.
 */
outagesRouter.use(requireAuth, requireRole(Roles.OPERATOR));

outagesRouter.post(
  "/outages",
  asyncHandler(async (req, res) => {
    /**
     * Creates a new outage.
     *
     * Body:
     * - location (string, required)
     * - faultType (string, required)
     * - severity (low|medium|high|critical, required)
     * - affectedCustomers (int >= 0, required)
     *
     * Returns: { outage }
     */
    const body = createSchema.parse(req.body);
    const idRes = await (await import("../db/pool.js")).pool.query<{ id: string }>(`SELECT gen_random_uuid() AS id`);
    const outageId = idRes.rows[0]!.id;

    const outage = await createOutage({
      id: outageId,
      location: body.location,
      faultType: body.faultType,
      severity: body.severity,
      affectedCustomers: body.affectedCustomers,
      status: OutageStatus.NEW,
      createdBy: req.user!.id
    });

    await insertOutageAudit({
      id: (await (await import("../db/pool.js")).pool.query<{ id: string }>(`SELECT gen_random_uuid() AS id`)).rows[0]!.id,
      outageId: outage.id,
      action: "created",
      actorUserId: req.user!.id,
      details: { status: outage.status }
    });

    wsHub.broadcast({ type: "outage_created", outage });

    const payload: CreateOutageResponse = { outage };
    res.status(201).json(payload);
  })
);

outagesRouter.get(
  "/outages",
  asyncHandler(async (_req, res) => {
    /**
     * Lists all active outages (non-resolved).
     *
     * Returns: { outages }
     */
    const outages = await listActiveOutages();
    const payload: ListActiveOutagesResponse = { outages };
    res.json(payload);
  })
);

outagesRouter.get(
  "/outages/:id",
  asyncHandler(async (req, res) => {
    /**
     * Gets outage detail by id, including audit records.
     *
     * Returns: { outage, audits }
     */
    const outage = await getOutageById(req.params.id);
    if (!outage) return res.status(404).json({ error: { message: "Outage not found", status: 404 } });

    const audits = await listAuditsForOutage(outage.id);
    const payload: GetOutageDetailResponse = { outage, audits };
    res.json(payload);
  })
);

outagesRouter.patch(
  "/outages/:id/status",
  asyncHandler(async (req, res) => {
    /**
     * Updates outage status.
     *
     * Body:
     * - status: new|investigating|identified|monitoring|resolved
     *
     * Returns: { outage }
     */
    const { status } = updateStatusSchema.parse(req.body);

    const resolvedAt = status === OutageStatus.RESOLVED ? new Date() : null;
    const updated = await updateOutageStatus({ id: req.params.id, status, resolvedAt });

    if (!updated) return res.status(404).json({ error: { message: "Outage not found", status: 404 } });

    await insertOutageAudit({
      id: (await (await import("../db/pool.js")).pool.query<{ id: string }>(`SELECT gen_random_uuid() AS id`)).rows[0]!.id,
      outageId: updated.id,
      action: "status_updated",
      actorUserId: req.user!.id,
      details: { status }
    });

    wsHub.broadcast({ type: "outage_status_updated", outage: updated });

    const payload: UpdateOutageStatusResponse = { outage: updated };
    res.json(payload);
  })
);

outagesRouter.post(
  "/outages/:id/resolve",
  asyncHandler(async (req, res) => {
    /**
     * Resolves an outage and generates an audit record.
     *
     * Returns: { outage, audit }
     */
    const updated = await updateOutageStatus({ id: req.params.id, status: OutageStatus.RESOLVED, resolvedAt: new Date() });
    if (!updated) return res.status(404).json({ error: { message: "Outage not found", status: 404 } });

    const audit = await insertOutageAudit({
      id: (await (await import("../db/pool.js")).pool.query<{ id: string }>(`SELECT gen_random_uuid() AS id`)).rows[0]!.id,
      outageId: updated.id,
      action: "resolved",
      actorUserId: req.user!.id,
      details: { status: OutageStatus.RESOLVED }
    });

    wsHub.broadcast({ type: "outage_resolved", outage: updated });

    const payload: ResolveOutageResponse = { outage: updated, audit };
    res.json(payload);
  })
);
