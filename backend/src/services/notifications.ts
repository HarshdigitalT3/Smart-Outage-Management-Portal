import { config } from "../config/env.js";
import type { Outage } from "@smartoutage/shared";
import {
  claimDueNotifications,
  insertNotificationLog,
  markNotificationFailed,
  markNotificationSent,
  type NotificationChannel,
  type NotificationEvent,
  type NotificationLogEntry
} from "../db/notifications.js";
import { pool } from "../db/pool.js";

/**
 * The system is scaffolded to avoid assuming real provider credentials exist.
 * If SMTP/Twilio are not configured, we will still create DB logs and mark them failed with retry.
 */

function computeBackoffDelayMs(params: { attemptIndex: number; baseDelayMs: number }): number {
  // attemptIndex starts at 1 for the first retry delay computation
  const factor = Math.pow(2, Math.max(0, params.attemptIndex - 1));
  return params.baseDelayMs * factor;
}

function buildOutageCreatedEmail(outage: Outage): { subject: string; body: string } {
  const subject = "Outage reported in your area";
  // Estimated restoration time is not currently tracked in schema; keep template stable and explicit.
  const body = [
    `An outage has been reported in your area.`,
    ``,
    `Location: ${outage.location}`,
    `Severity: ${outage.severity}`,
    `Estimated restoration time: TBD`,
    `Reference number: ${outage.id}`
  ].join("\n");
  return { subject, body };
}

function buildOutageResolvedEmail(outage: Outage): { subject: string; body: string } {
  const subject = "Power restored in your area";
  const body = [
    `Power has been restored in your area.`,
    ``,
    `Restoration time: ${outage.resolvedAt ?? new Date().toISOString()}`,
    `Reference number: ${outage.id}`
  ].join("\n");
  return { subject, body };
}

function buildSmsBody(params: { eventType: NotificationEvent; outage: Outage }): string {
  if (params.eventType === "outage_created") {
    return `Outage reported: ${params.outage.location} (severity: ${params.outage.severity}). Ref: ${params.outage.id}`;
  }
  return `Power restored: ${params.outage.location}. Ref: ${params.outage.id}`;
}

async function sendEmail(params: { to: string; subject: string; body: string }): Promise<void> {
  const smtp = config.notifications.smtp;
  if (!smtp.host || !smtp.port || !smtp.user || !smtp.pass || !smtp.from) {
    throw new Error("SMTP not configured (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM required)");
  }

  const { default: nodemailer } = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass }
  });

  await transporter.sendMail({
    from: smtp.from,
    to: params.to,
    subject: params.subject,
    text: params.body
  });
}

async function sendSms(params: { to: string; body: string }): Promise<void> {
  const sms = config.notifications.sms;
  if (!sms.provider || sms.provider === "mock") {
    throw new Error("SMS provider not configured (set SMS_PROVIDER=twilio and Twilio credentials)");
  }
  if (sms.provider !== "twilio") {
    throw new Error(`Unsupported SMS provider: ${sms.provider}`);
  }

  const { default: twilio } = await import("twilio");
  const accountSid = sms.twilio.accountSid;
  const authToken = sms.twilio.authToken;
  const fromNumber = sms.twilio.fromNumber;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Twilio not configured (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER required)");
  }

  const client = twilio(accountSid, authToken);
  await client.messages.create({ to: params.to, from: fromNumber, body: params.body });
}

async function attemptSend(log: NotificationLogEntry): Promise<void> {
  if (log.channel === "email") {
    await sendEmail({ to: log.recipient, subject: log.subject ?? "(no subject)", body: log.body });
    return;
  }
  await sendSms({ to: log.recipient, body: log.body });
}

// PUBLIC_INTERFACE
export async function enqueueOutageNotifications(params: { outage: Outage; eventType: NotificationEvent }): Promise<void> {
  /**
   * Enqueues email + SMS notifications for a specific outage event into the DB log.
   * Actual sending is performed asynchronously by the notification worker loop.
   */
  const toEmail = config.notifications.recipients.toEmail;
  const toPhone = config.notifications.recipients.toPhone;

  const idRes = await pool.query<{ id: string }>(`SELECT gen_random_uuid() AS id`);
  const maxAttempts = config.notifications.retry.maxAttempts;

  const inserts: Array<Promise<any>> = [];

  if (toEmail) {
    const email = params.eventType === "outage_created" ? buildOutageCreatedEmail(params.outage) : buildOutageResolvedEmail(params.outage);
    inserts.push(
      insertNotificationLog({
        id: idRes.rows[0]!.id,
        outageId: params.outage.id,
        eventType: params.eventType,
        channel: "email",
        recipient: toEmail,
        subject: email.subject,
        body: email.body,
        status: "pending",
        maxAttempts,
        nextAttemptAt: null
      })
    );
  }

  if (toPhone) {
    const smsBody = buildSmsBody({ eventType: params.eventType, outage: params.outage });
    const idRes2 = await pool.query<{ id: string }>(`SELECT gen_random_uuid() AS id`);
    inserts.push(
      insertNotificationLog({
        id: idRes2.rows[0]!.id,
        outageId: params.outage.id,
        eventType: params.eventType,
        channel: "sms",
        recipient: toPhone,
        subject: null,
        body: smsBody,
        status: "pending",
        maxAttempts,
        nextAttemptAt: null
      })
    );
  }

  await Promise.all(inserts);
}

let workerTimer: NodeJS.Timeout | null = null;

// PUBLIC_INTERFACE
export function startNotificationWorker(): void {
  /**
   * Starts a lightweight in-process worker that retries pending notifications.
   * This satisfies the "no manual action required from operator" requirement.
   *
   * Notes:
   * - Safe to call multiple times; it will only start once.
   * - Uses DB-level SKIP LOCKED to avoid double-sends across multiple API instances.
   */
  if (workerTimer) return;

  const tickIntervalMs = 1000;

  const tick = async () => {
    try {
      const due = await claimDueNotifications({ now: new Date(), limit: 25 });
      for (const log of due) {
        try {
          await attemptSend(log);
          await markNotificationSent({ id: log.id });
        } catch (err: any) {
          const attemptIndex = log.attemptCount + 1; // we will increment in DB on failure
          const hasMoreAttempts = attemptIndex < log.maxAttempts;
          const delayMs = computeBackoffDelayMs({ attemptIndex, baseDelayMs: config.notifications.retry.baseDelayMs });
          const nextAttemptAt = hasMoreAttempts ? new Date(Date.now() + delayMs) : null;

          await markNotificationFailed({
            id: log.id,
            errorMessage: (err?.message ?? String(err)).slice(0, 2000),
            nextAttemptAt
          });
        }
      }
    } catch {
      // Intentionally swallow to keep worker alive; failures will be visible via health/db errors elsewhere.
    }
  };

  // Fire quickly, then on interval.
  void tick();
  workerTimer = setInterval(() => void tick(), tickIntervalMs);
}

// PUBLIC_INTERFACE
export function stopNotificationWorker(): void {
  /**
   * Stops the in-process notification worker (primarily for tests/clean shutdown).
   */
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}
