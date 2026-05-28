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
  CORS_ORIGIN: { required: true }
});

export const config = {
  nodeEnv: env.NODE_ENV,
  port: Number(env.BACKEND_PORT),
  databaseUrl: env.DATABASE_URL,
  jwt: {
    secret: env.JWT_SECRET,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    expiresIn: env.JWT_EXPIRES_IN
  },
  corsOrigin: env.CORS_ORIGIN
};
