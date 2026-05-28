import { pool } from "./pool.js";
import type { Outage, OutageAudit, OutageSeverity, OutageStatus } from "@smartoutage/shared";

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
