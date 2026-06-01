import pg from "pg";
import { config } from "../config/env.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl
});

// PUBLIC_INTERFACE
export async function dbHealthcheck(): Promise<boolean> {
  /**
   * Runs a lightweight query to verify DB connectivity.
   */
  const res = await pool.query("SELECT 1 AS ok");
  return res.rows?.[0]?.ok === 1;
}
