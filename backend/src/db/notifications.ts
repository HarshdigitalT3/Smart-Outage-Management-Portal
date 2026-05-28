import { pool } from "./pool.js";

export type NotificationChannel = "email" | "sms";
export type NotificationEvent = "outage_created" | "outage_resolved";
export type NotificationStatus = "pending" | "sending" | "sent" | "failed";

type NotificationLogRow = {
  id: string;
  outage_id: string;
  event_type: NotificationEvent;
  channel: NotificationChannel;
  recipient: string;
  subject: string | null;
  body: string;
  status: NotificationStatus;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  next_attempt_at: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
};

export type NotificationLogEntry = {
  id: string;
  outageId: string;
  eventType: NotificationEvent;
  channel: NotificationChannel;
  recipient: string;
  subject: string | null;
  body: string;
  status: NotificationStatus;
  attemptCount: number;
  maxAttempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
};

function mapLogRow(row: NotificationLogRow): NotificationLogEntry {
  return {
    id: row.id,
    outageId: row.outage_id,
    eventType: row.event_type,
    channel: row.channel,
    recipient: row.recipient,
    subject: row.subject,
    body: row.body,
    status: row.status,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
    nextAttemptAt: row.next_attempt_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sentAt: row.sent_at
  };
}

// PUBLIC_INTERFACE
export async function insertNotificationLog(params: {
  id: string;
  outageId: string;
  eventType: NotificationEvent;
  channel: NotificationChannel;
  recipient: string;
  subject: string | null;
  body: string;
  status: NotificationStatus;
  maxAttempts: number;
  nextAttemptAt: Date | null;
}): Promise<NotificationLogEntry> {
  /**
   * Inserts a notification log entry.
   */
  const res = await pool.query<NotificationLogRow>(
    `INSERT INTO app_notification_logs
      (id, outage_id, event_type, channel, recipient, subject, body, status, attempt_count, max_attempts, next_attempt_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10)
     RETURNING id, outage_id, event_type, channel, recipient, subject, body, status, attempt_count, max_attempts,
               last_error, next_attempt_at, created_at, updated_at, sent_at`,
    [
      params.id,
      params.outageId,
      params.eventType,
      params.channel,
      params.recipient,
      params.subject,
      params.body,
      params.status,
      params.maxAttempts,
      params.nextAttemptAt ? params.nextAttemptAt.toISOString() : null
    ]
  );

  return mapLogRow(res.rows[0]!);
}

// PUBLIC_INTERFACE
export async function markNotificationSending(params: { id: string }): Promise<void> {
  /**
   * Marks a notification as currently sending.
   */
  await pool.query(
    `UPDATE app_notification_logs
        SET status = 'sending',
            updated_at = NOW()
      WHERE id = $1`,
    [params.id]
  );
}

// PUBLIC_INTERFACE
export async function markNotificationSent(params: { id: string }): Promise<void> {
  /**
   * Marks a notification as sent successfully.
   */
  await pool.query(
    `UPDATE app_notification_logs
        SET status = 'sent',
            sent_at = NOW(),
            next_attempt_at = NULL,
            updated_at = NOW()
      WHERE id = $1`,
    [params.id]
  );
}

// PUBLIC_INTERFACE
export async function markNotificationFailed(params: {
  id: string;
  errorMessage: string;
  nextAttemptAt: Date | null;
}): Promise<void> {
  /**
   * Marks a notification as failed and schedules the next attempt if provided.
   * Also increments attempt_count.
   */
  await pool.query(
    `UPDATE app_notification_logs
        SET status = CASE WHEN $3::timestamptz IS NULL THEN 'failed' ELSE 'pending' END,
            attempt_count = attempt_count + 1,
            last_error = $2,
            next_attempt_at = $3,
            updated_at = NOW()
      WHERE id = $1`,
    [params.id, params.errorMessage, params.nextAttemptAt ? params.nextAttemptAt.toISOString() : null]
  );
}

// PUBLIC_INTERFACE
export async function listNotificationLogs(params: {
  limit: number;
  offset: number;
  outageId?: string;
}): Promise<NotificationLogEntry[]> {
  /**
   * Returns notification logs newest-first, optionally filtered by outageId.
   */
  const args: any[] = [];
  let where = "";
  if (params.outageId) {
    args.push(params.outageId);
    where = `WHERE outage_id = $${args.length}`;
  }
  args.push(params.limit);
  args.push(params.offset);

  const res = await pool.query<NotificationLogRow>(
    `SELECT id, outage_id, event_type, channel, recipient, subject, body, status, attempt_count, max_attempts,
            last_error, next_attempt_at, created_at, updated_at, sent_at
       FROM app_notification_logs
       ${where}
      ORDER BY created_at DESC
      LIMIT $${args.length - 1} OFFSET $${args.length}`,
    args
  );

  return res.rows.map(mapLogRow);
}

// PUBLIC_INTERFACE
export async function claimDueNotifications(params: { now: Date; limit: number }): Promise<NotificationLogEntry[]> {
  /**
   * Atomically claims due pending notifications by switching them to "sending".
   * This prevents duplicate sends when multiple workers are running.
   */
  const res = await pool.query<NotificationLogRow>(
    `WITH due AS (
       SELECT id
         FROM app_notification_logs
        WHERE status = 'pending'
          AND (next_attempt_at IS NULL OR next_attempt_at <= $1)
          AND attempt_count < max_attempts
        ORDER BY created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
     )
     UPDATE app_notification_logs l
        SET status = 'sending',
            updated_at = NOW()
       FROM due
      WHERE l.id = due.id
      RETURNING l.id, l.outage_id, l.event_type, l.channel, l.recipient, l.subject, l.body, l.status, l.attempt_count,
                l.max_attempts, l.last_error, l.next_attempt_at, l.created_at, l.updated_at, l.sent_at`,
    [params.now.toISOString(), params.limit]
  );

  return res.rows.map(mapLogRow);
}
