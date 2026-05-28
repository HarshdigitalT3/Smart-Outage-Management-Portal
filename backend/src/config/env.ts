import dotenv from "dotenv";
import { validateEnv } from "@smartoutage/shared";

dotenv.config();

const env = validateEnv(process.env, {
  NODE_ENV: { required: true },
  BACKEND_PORT: { required: true },
  DATABASE_URL: { required: true },
  JWT_SECRET: { required: true },
  JWT_ISSUER: { required: false },
  JWT_AUDIENCE: { required: false },
  JWT_EXPIRES_IN: { required: true },
  REFRESH_JWT_SECRET: { required: true },
  REFRESH_JWT_EXPIRES_IN: { required: true },
  BCRYPT_COST: { required: false },
  CORS_ORIGIN: { required: true },

  // Notifications (Email)
  SMTP_HOST: { required: false },
  SMTP_PORT: { required: false },
  SMTP_USER: { required: false },
  SMTP_PASS: { required: false },
  SMTP_FROM: { required: false },

  // Notifications (SMS)
  SMS_PROVIDER: { required: false }, // "twilio" | "mock"
  TWILIO_ACCOUNT_SID: { required: false },
  TWILIO_AUTH_TOKEN: { required: false },
  TWILIO_FROM_NUMBER: { required: false },

  // Business routing for notifications
  NOTIFY_TO_EMAIL: { required: false },
  NOTIFY_TO_PHONE: { required: false },

  // Retry behavior
  NOTIFICATION_MAX_ATTEMPTS: { required: false },
  NOTIFICATION_RETRY_BASE_DELAY_MS: { required: false }
});

export const config = {
  nodeEnv: env.NODE_ENV,
  port: Number(env.BACKEND_PORT),
  databaseUrl: env.DATABASE_URL,
  bcryptCost: env.BCRYPT_COST ? Number(env.BCRYPT_COST) : 12,
  jwt: {
    secret: env.JWT_SECRET,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    expiresIn: env.JWT_EXPIRES_IN
  },
  refreshJwt: {
    secret: env.REFRESH_JWT_SECRET,
    expiresIn: env.REFRESH_JWT_EXPIRES_IN
  },
  corsOrigin: env.CORS_ORIGIN,
  notifications: {
    smtp: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ? Number(env.SMTP_PORT) : undefined,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.SMTP_FROM
    },
    sms: {
      provider: env.SMS_PROVIDER,
      twilio: {
        accountSid: env.TWILIO_ACCOUNT_SID,
        authToken: env.TWILIO_AUTH_TOKEN,
        fromNumber: env.TWILIO_FROM_NUMBER
      }
    },
    recipients: {
      toEmail: env.NOTIFY_TO_EMAIL,
      toPhone: env.NOTIFY_TO_PHONE
    },
    retry: {
      maxAttempts: env.NOTIFICATION_MAX_ATTEMPTS ? Number(env.NOTIFICATION_MAX_ATTEMPTS) : 3,
      baseDelayMs: env.NOTIFICATION_RETRY_BASE_DELAY_MS ? Number(env.NOTIFICATION_RETRY_BASE_DELAY_MS) : 2_000
    }
  }
};
