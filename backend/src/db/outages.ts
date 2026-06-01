import { pool } from "./pool.js";
import type { Outage, OutageAudit, OutageMapPoint, OutageSeverity, OutageStatus } from "@smartoutage/shared";

type OutageRow = {
  id: string;
  location: string;
  fault_type: string;
  severity: OutageSeverity;
  affected_customers: number;
  status: OutageStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

type OutageAuditRow = {
  id: string;
  outage_id: string;
  action: "created" | "status_updated" | "resolved";
  actor_user_id: string;
  details: any;
  created_at: string;
};

type ResolvedOutageRow = OutageRow;

type AuditExportRow = {
  audit_id: string;
  audit_created_at: string;
  outage_id: string;
  outage_location: string;
  outage_fault_type: string;
  outage_severity: OutageSeverity;
  outage_affected_customers: number;
  outage_status: OutageStatus;
  outage_created_at: string;
  outage_updated_at: string;
  outage_resolved_at: string | null;
  actor_user_id: string;
  action: "created" | "status_updated" | "resolved";
  details: any;
};

function mapOutage(row: OutageRow): Outage {
  return {
    id: row.id,
    location: row.location,
    faultType: row.fault_type,
    severity: row.severity,
    affectedCustomers: row.affected_customers,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at
  };
}

function mapAudit(row: OutageAuditRow): OutageAudit {
  return {
    id: row.id,
    outageId: row.outage_id,
    action: row.action,
    actorUserId: row.actor_user_id,
    details: row.details ?? {},
    createdAt: row.created_at
  };
}

/**
 * Derives stable pseudo-coordinates from a string key.
 *
 * This avoids calling external geocoding services in the scaffold while still enabling
 * a functional map UI. The output is stable across requests for the same key.
 *
 * We keep points in a plausible service area bounding box.
 */
function deriveCoordinates(key: string): { lat: number; lng: number } {
  // Simple 32-bit hash (deterministic).
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = h >>> 0;

  // Bounding box (roughly Bay Area) - replace with real geocoding when available.
  const latMin = 37.2;
  const latMax = 37.95;
  const lngMin = -122.55;
  const lngMax = -121.75;

  const frac1 = (u & 0xffff) / 0xffff;
  const frac2 = ((u >>> 16) & 0xffff) / 0xffff;

  const lat = latMin + (latMax - latMin) * frac1;
  const lng = lngMin + (lngMax - lngMin) * frac2;

  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

function mapOutageToMapPoint(outage: Outage): OutageMapPoint {
  const { lat, lng } = deriveCoordinates(`${outage.location}::${outage.id}`);
  return {
    outageId: outage.id,
    severity: outage.severity,
    locationLabel: outage.location,
    affectedCustomers: outage.affectedCustomers,
    status: outage.status,
    createdAt: outage.createdAt,
    updatedAt: outage.updatedAt,
    resolvedAt: outage.resolvedAt,
    lat,
    lng
  };
}

// PUBLIC_INTERFACE
export async function createOutage(params: {
  id: string;
  location: string;
  faultType: string;
  severity: OutageSeverity;
  affectedCustomers: number;
  status: OutageStatus;
  createdBy: string;
}): Promise<Outage> {
  /**
   * Inserts a new outage row and returns the created outage.
   */
  const res = await pool.query<OutageRow>(
    `INSERT INTO app_outages (id, location, fault_type, severity, affected_customers, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, location, fault_type, severity, affected_customers, status, created_by, created_at, updated_at, resolved_at`,
    [params.id, params.location, params.faultType, params.severity, params.affectedCustomers, params.status, params.createdBy]
  );
  return mapOutage(res.rows[0]!);
}

// PUBLIC_INTERFACE
export async function listActiveOutages(): Promise<Outage[]> {
  /**
   * Lists all active outages (status != resolved) newest first.
   */
  const res = await pool.query<OutageRow>(
    `SELECT id, location, fault_type, severity, affected_customers, status, created_by, created_at, updated_at, resolved_at
       FROM app_outages
      WHERE status <> 'resolved'
      ORDER BY created_at DESC`
  );
  return res.rows.map(mapOutage);
}

// PUBLIC_INTERFACE
export async function listActiveOutagesMapPoints(): Promise<OutageMapPoint[]> {
  /**
   * Lists all active outages as map points (coordinates + severity).
   *
   * Note: coordinates are derived deterministically from outage data (scaffold-friendly)
   * and should be replaced with real geocoding when available.
   */
  const outages = await listActiveOutages();
  return outages.map(mapOutageToMapPoint);
}

// PUBLIC_INTERFACE
export async function getOutageById(id: string): Promise<Outage | null> {
  /**
   * Returns a single outage by id, or null if not found.
   */
  const res = await pool.query<OutageRow>(
    `SELECT id, location, fault_type, severity, affected_customers, status, created_by, created_at, updated_at, resolved_at
       FROM app_outages
      WHERE id = $1
      LIMIT 1`,
    [id]
  );
  return res.rows[0] ? mapOutage(res.rows[0]) : null;
}

// PUBLIC_INTERFACE
export async function listAuditsForOutage(outageId: string): Promise<OutageAudit[]> {
  /**
   * Lists audits for an outage, oldest-first.
   */
  const res = await pool.query<OutageAuditRow>(
    `SELECT id, outage_id, action, actor_user_id, details, created_at
       FROM app_outage_audits
      WHERE outage_id = $1
      ORDER BY created_at ASC`,
    [outageId]
  );
  return res.rows.map(mapAudit);
}

// PUBLIC_INTERFACE
export async function insertOutageAudit(params: {
  id: string;
  outageId: string;
  action: "created" | "status_updated" | "resolved";
  actorUserId: string;
  details: Record<string, unknown>;
}): Promise<OutageAudit> {
  /**
   * Inserts an outage audit record and returns it.
   */
  const res = await pool.query<OutageAuditRow>(
    `INSERT INTO app_outage_audits (id, outage_id, action, actor_user_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id, outage_id, action, actor_user_id, details, created_at`,
    [params.id, params.outageId, params.action, params.actorUserId, JSON.stringify(params.details ?? {})]
  );
  return mapAudit(res.rows[0]!);
}

// PUBLIC_INTERFACE
export async function updateOutageStatus(params: {
  id: string;
  status: OutageStatus;
  resolvedAt: Date | null;
}): Promise<Outage | null> {
  /**
   * Updates outage status (and optionally resolved_at) and returns the updated outage.
   * Returns null if outage not found.
   */
  const res = await pool.query<OutageRow>(
    `UPDATE app_outages
        SET status = $2,
            resolved_at = $3
      WHERE id = $1
      RETURNING id, location, fault_type, severity, affected_customers, status, created_by, created_at, updated_at, resolved_at`,
    [params.id, params.status, params.resolvedAt ? params.resolvedAt.toISOString() : null]
  );
  return res.rows[0] ? mapOutage(res.rows[0]) : null;
}

// PUBLIC_INTERFACE
export async function listResolvedOutages(params?: { limit?: number; offset?: number }): Promise<Outage[]> {
  /**
   * Lists resolved outages, newest resolved first.
   *
   * Note: this is used by the operator UI (resolved history) and CSV export flow.
   */
  const limit = Math.min(Math.max(params?.limit ?? 100, 1), 1000);
  const offset = Math.max(params?.offset ?? 0, 0);

  const res = await pool.query<ResolvedOutageRow>(
    `SELECT id, location, fault_type, severity, affected_customers, status, created_by, created_at, updated_at, resolved_at
       FROM app_outages
      WHERE status = 'resolved'
      ORDER BY resolved_at DESC NULLS LAST, updated_at DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return res.rows.map(mapOutage);
}

// PUBLIC_INTERFACE
export async function getOutageAuditById(auditId: string): Promise<OutageAudit | null> {
  /**
   * Fetches a single outage audit by audit id.
   */
  const res = await pool.query<OutageAuditRow>(
    `SELECT id, outage_id, action, actor_user_id, details, created_at
       FROM app_outage_audits
      WHERE id = $1
      LIMIT 1`,
    [auditId]
  );
  return res.rows[0] ? mapAudit(res.rows[0]) : null;
}

// PUBLIC_INTERFACE
export async function listAudits(params?: { limit?: number; offset?: number }): Promise<OutageAudit[]> {
  /**
   * Lists outage audits across all outages (newest-first).
   */
  const limit = Math.min(Math.max(params?.limit ?? 200, 1), 5000);
  const offset = Math.max(params?.offset ?? 0, 0);

  const res = await pool.query<OutageAuditRow>(
    `SELECT id, outage_id, action, actor_user_id, details, created_at
       FROM app_outage_audits
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return res.rows.map(mapAudit);
}

// PUBLIC_INTERFACE
export async function listAuditsForResolvedOutagesExport(params?: {
  from?: Date;
  to?: Date;
}): Promise<
  Array<{
    auditId: string;
    auditCreatedAt: string;
    outageId: string;
    outageLocation: string;
    outageFaultType: string;
    outageSeverity: OutageSeverity;
    outageAffectedCustomers: number;
    outageStatus: OutageStatus;
    outageCreatedAt: string;
    outageUpdatedAt: string;
    outageResolvedAt: string | null;
    actorUserId: string;
    action: "created" | "status_updated" | "resolved";
    details: Record<string, unknown>;
  }>
> {
  /**
   * Returns a joined dataset (audits + outage snapshot columns) for CSV export.
   *
   * Optional filtering:
   * - from/to apply to outage.resolved_at
   */
  const fromIso = params?.from ? params.from.toISOString() : null;
  const toIso = params?.to ? params.to.toISOString() : null;

  const res = await pool.query<AuditExportRow>(
    `SELECT
        a.id AS audit_id,
        a.created_at AS audit_created_at,
        a.outage_id AS outage_id,
        o.location AS outage_location,
        o.fault_type AS outage_fault_type,
        o.severity AS outage_severity,
        o.affected_customers AS outage_affected_customers,
        o.status AS outage_status,
        o.created_at AS outage_created_at,
        o.updated_at AS outage_updated_at,
        o.resolved_at AS outage_resolved_at,
        a.actor_user_id AS actor_user_id,
        a.action AS action,
        a.details AS details
     FROM app_outage_audits a
     JOIN app_outages o ON o.id = a.outage_id
    WHERE o.status = 'resolved'
      AND ($1::timestamptz IS NULL OR o.resolved_at >= $1::timestamptz)
      AND ($2::timestamptz IS NULL OR o.resolved_at <= $2::timestamptz)
    ORDER BY o.resolved_at DESC NULLS LAST, a.created_at ASC`,
    [fromIso, toIso]
  );

  return res.rows.map((r) => ({
    auditId: r.audit_id,
    auditCreatedAt: r.audit_created_at,
    outageId: r.outage_id,
    outageLocation: r.outage_location,
    outageFaultType: r.outage_fault_type,
    outageSeverity: r.outage_severity,
    outageAffectedCustomers: r.outage_affected_customers,
    outageStatus: r.outage_status,
    outageCreatedAt: r.outage_created_at,
    outageUpdatedAt: r.outage_updated_at,
    outageResolvedAt: r.outage_resolved_at,
    actorUserId: r.actor_user_id,
    action: r.action,
    details: (r.details ?? {}) as Record<string, unknown>
  }));
}

// PUBLIC_INTERFACE
export async function findActiveOutageForPostcode(postcode: string): Promise<Outage | null> {
  /**
   * Finds the most relevant active outage for a given postcode.
   *
   * IMPORTANT: The current scaffold schema has no dedicated postcode/service-area mapping.
   * To enable the customer self-serve portal without adding migrations in this step,
   * we treat `app_outages.location` as a free-text field and match when it contains the
   * postcode substring (case-insensitive).
   *
   * Future enhancement: introduce structured outage service areas (e.g. a join table)
   * and replace this implementation with an indexed lookup.
   */
  const cleaned = postcode.trim();
  if (!cleaned) return null;

  const res = await pool.query<OutageRow>(
    `SELECT id, location, fault_type, severity, affected_customers, status, created_by, created_at, updated_at, resolved_at
       FROM app_outages
      WHERE status <> 'resolved'
        AND location ILIKE $1
      ORDER BY updated_at DESC
      LIMIT 1`,
    [`%${cleaned}%`]
  );

  return res.rows[0] ? mapOutage(res.rows[0]) : null;
}
