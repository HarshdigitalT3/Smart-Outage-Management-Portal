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
  ListActiveOutagesMapResponse,
  ResolveOutageResponse,
  UpdateOutageStatusResponse
} from "@smartoutage/shared";
import {
  createOutage,
  getOutageById,
  getOutageAuditById,
  insertOutageAudit,
  listActiveOutages,
  listActiveOutagesMapPoints,
  listAudits,
  listAuditsForOutage,
  listAuditsForResolvedOutagesExport,
  listResolvedOutages,
  updateOutageStatus
} from "../db/outages.js";
import { wsHub } from "../singleton/ws.js";
import { enqueueOutageNotifications } from "../services/notifications.js";

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

const pagingSchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

const exportSchema = z.object({
  from: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe("ISO datetime with timezone offset; filters by outage.resolved_at >= from"),
  to: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe("ISO datetime with timezone offset; filters by outage.resolved_at <= to")
});

function csvEscape(value: unknown): string {
  // Minimal RFC4180-style escaping (quote fields containing comma, quote, or newline).
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

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
    // Also broadcast a map update snapshot so map views can update without replay logic.
    wsHub.broadcast({ type: "outages_map_updated", points: await listActiveOutagesMapPoints() });

    // Fire-and-forget: enqueue notifications for async send/retry worker.
    void enqueueOutageNotifications({ outage, eventType: "outage_created" });

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
  "/outages/map",
  asyncHandler(async (_req, res) => {
    /**
     * Lists all active outages as map points (coordinates + severity).
     *
     * Returns: { points }
     */
    const points = await listActiveOutagesMapPoints();
    const payload: ListActiveOutagesMapResponse = { points };
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

outagesRouter.get(
  "/outages/resolved",
  asyncHandler(async (req, res) => {
    /**
     * Lists resolved outages (history).
     *
     * Query:
     * - limit (optional, 1..1000, default 100)
     * - offset (optional, >=0, default 0)
     *
     * Returns: { outages }
     */
    const { limit, offset } = pagingSchema.parse(req.query);
    const outages = await listResolvedOutages({ limit, offset });
    res.json({ outages });
  })
);

outagesRouter.get(
  "/audits",
  asyncHandler(async (req, res) => {
    /**
     * Lists outage audits across all outages, newest-first.
     *
     * Query:
     * - limit (optional, 1..1000, default 200)
     * - offset (optional, >=0, default 0)
     *
     * Returns: { audits }
     */
    const { limit, offset } = pagingSchema.parse(req.query);
    const audits = await listAudits({ limit, offset });
    res.json({ audits });
  })
);

outagesRouter.get(
  "/audits/:id",
  asyncHandler(async (req, res) => {
    /**
     * Gets a single outage audit record by id.
     *
     * Returns: { audit }
     */
    const audit = await getOutageAuditById(req.params.id);
    if (!audit) return res.status(404).json({ error: { message: "Audit not found", status: 404 } });
    res.json({ audit });
  })
);

outagesRouter.get(
  "/audits/export.csv",
  asyncHandler(async (req, res) => {
    /**
     * Exports audits for resolved outages as a CSV file.
     *
     * Query:
     * - from (optional): ISO datetime with timezone offset; filters by outage.resolved_at >= from
     * - to (optional): ISO datetime with timezone offset; filters by outage.resolved_at <= to
     *
     * Response: text/csv (download)
     */
    const { from, to } = exportSchema.parse(req.query);
    const rows = await listAuditsForResolvedOutagesExport({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined
    });

    const header = [
      "auditId",
      "auditCreatedAt",
      "outageId",
      "outageLocation",
      "outageFaultType",
      "outageSeverity",
      "outageAffectedCustomers",
      "outageStatus",
      "outageCreatedAt",
      "outageUpdatedAt",
      "outageResolvedAt",
      "actorUserId",
      "action",
      "detailsJson"
    ];

    const lines: string[] = [];
    lines.push(header.join(","));
    for (const r of rows) {
      const detailsJson = JSON.stringify(r.details ?? {});
      lines.push(
        [
          r.auditId,
          r.auditCreatedAt,
          r.outageId,
          r.outageLocation,
          r.outageFaultType,
          r.outageSeverity,
          r.outageAffectedCustomers,
          r.outageStatus,
          r.outageCreatedAt,
          r.outageUpdatedAt,
          r.outageResolvedAt ?? "",
          r.actorUserId,
          r.action,
          detailsJson
        ]
          .map(csvEscape)
          .join(",")
      );
    }

    const csv = lines.join("\n");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="resolved-outage-audits-${stamp}.csv"`);
    res.status(200).send(csv);
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
    wsHub.broadcast({ type: "outages_map_updated", points: await listActiveOutagesMapPoints() });

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
    wsHub.broadcast({ type: "outages_map_updated", points: await listActiveOutagesMapPoints() });

    // Fire-and-forget: enqueue notifications for async send/retry worker.
    void enqueueOutageNotifications({ outage: updated, eventType: "outage_resolved" });

    const payload: ResolveOutageResponse = { outage: updated, audit };
    res.json(payload);
  })
);
