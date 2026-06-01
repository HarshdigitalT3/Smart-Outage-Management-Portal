import { pool } from "./pool.js";
import type { CrewMember, JobCard, JobCardWithOutage, JobStatus } from "@smartoutage/shared";

type CrewRow = {
  id: string;
  user_id: string;
  display_name: string;
};

type JobRow = {
  id: string;
  outage_id: string;
  crew_user_id: string;
  status: JobStatus;
  safety_notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

type JobWithOutageRow = JobRow & {
  outage_location: string;
  outage_fault_type: string;
  outage_severity: string;
  outage_affected_customers: number;
  outage_status: string;
  outage_created_at: string;
  outage_updated_at: string;
  outage_resolved_at: string | null;
};

function mapCrew(row: CrewRow): CrewMember {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name
  };
}

function mapJob(row: JobRow): JobCard {
  return {
    id: row.id,
    outageId: row.outage_id,
    crewUserId: row.crew_user_id,
    status: row.status,
    safetyNotes: row.safety_notes ?? "",
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at
  };
}

function mapJobWithOutage(row: JobWithOutageRow): JobCardWithOutage {
  return {
    ...mapJob(row),
    outage: {
      id: row.outage_id,
      location: row.outage_location,
      faultType: row.outage_fault_type,
      severity: row.outage_severity,
      affectedCustomers: row.outage_affected_customers,
      status: row.outage_status,
      createdAt: row.outage_created_at,
      updatedAt: row.outage_updated_at,
      resolvedAt: row.outage_resolved_at
    }
  };
}

// PUBLIC_INTERFACE
export async function listAvailableCrew(): Promise<CrewMember[]> {
  /**
   * Lists field crew who are currently "available".
   *
   * Availability is derived from crews without any active (non-resolved) job.
   */
  const res = await pool.query<CrewRow>(
    `
    SELECT c.id, c.user_id, c.display_name
      FROM app_crews c
 LEFT JOIN app_jobs j
        ON j.crew_user_id = c.user_id
       AND j.status <> 'resolved'
     WHERE j.id IS NULL
     ORDER BY c.display_name ASC
    `
  );
  return res.rows.map(mapCrew);
}

// PUBLIC_INTERFACE
export async function assignCrewToOutage(params: {
  jobId: string;
  outageId: string;
  crewUserId: string;
  safetyNotes: string;
  createdBy: string;
}): Promise<JobCard> {
  /**
   * Creates a job card for an outage, assigning it to a crew member.
   *
   * Note: the DB enforces at most one active (non-resolved) job per outage.
   */
  const res = await pool.query<JobRow>(
    `
    INSERT INTO app_jobs (id, outage_id, crew_user_id, status, safety_notes, created_by)
    VALUES ($1, $2, $3, 'assigned', $4, $5)
    RETURNING id, outage_id, crew_user_id, status, safety_notes, created_by, created_at, updated_at, resolved_at
    `,
    [params.jobId, params.outageId, params.crewUserId, params.safetyNotes, params.createdBy]
  );

  return mapJob(res.rows[0]!);
}

// PUBLIC_INTERFACE
export async function listJobsForCrewUser(crewUserId: string): Promise<JobCardWithOutage[]> {
  /**
   * Lists job cards assigned to a specific crew user, newest-first.
   * Includes outage fields needed for a "job card" UI.
   */
  const res = await pool.query<JobWithOutageRow>(
    `
    SELECT
      j.id,
      j.outage_id,
      j.crew_user_id,
      j.status,
      j.safety_notes,
      j.created_by,
      j.created_at,
      j.updated_at,
      j.resolved_at,

      o.location           AS outage_location,
      o.fault_type         AS outage_fault_type,
      o.severity           AS outage_severity,
      o.affected_customers AS outage_affected_customers,
      o.status             AS outage_status,
      o.created_at         AS outage_created_at,
      o.updated_at         AS outage_updated_at,
      o.resolved_at        AS outage_resolved_at
    FROM app_jobs j
    JOIN app_outages o ON o.id = j.outage_id
    WHERE j.crew_user_id = $1
    ORDER BY j.created_at DESC
    `,
    [crewUserId]
  );

  return res.rows.map(mapJobWithOutage);
}

// PUBLIC_INTERFACE
export async function getJobById(jobId: string): Promise<JobCard | null> {
  /**
   * Fetches a single job by id, or null if not found.
   */
  const res = await pool.query<JobRow>(
    `
    SELECT id, outage_id, crew_user_id, status, safety_notes, created_by, created_at, updated_at, resolved_at
      FROM app_jobs
     WHERE id = $1
     LIMIT 1
    `,
    [jobId]
  );
  return res.rows[0] ? mapJob(res.rows[0]) : null;
}

// PUBLIC_INTERFACE
export async function updateJobStatus(params: { jobId: string; status: JobStatus; resolvedAt: Date | null }): Promise<JobCard | null> {
  /**
   * Updates a job status, setting resolved_at when status becomes 'resolved'.
   */
  const res = await pool.query<JobRow>(
    `
    UPDATE app_jobs
       SET status = $2,
           resolved_at = $3
     WHERE id = $1
     RETURNING id, outage_id, crew_user_id, status, safety_notes, created_by, created_at, updated_at, resolved_at
    `,
    [params.jobId, params.status, params.resolvedAt ? params.resolvedAt.toISOString() : null]
  );

  return res.rows[0] ? mapJob(res.rows[0]) : null;
}
