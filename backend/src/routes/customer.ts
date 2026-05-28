import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { findActiveOutageForPostcode } from "../db/outages.js";
import { CustomerOutageStatus } from "@smartoutage/shared";
import type { CustomerStatusLookupResponse } from "@smartoutage/shared";

export const customerRouter = Router();

const postcodeSchema = z
  .string()
  .trim()
  // Keep validation intentionally broad since postcode formats vary by country.
  // We require at least 2 characters and allow alphanumerics, space and hyphen.
  .min(2)
  .max(12)
  .regex(/^[A-Za-z0-9 -]+$/);

/**
 * Public customer endpoints (no-login).
 */
customerRouter.get(
  "/customer/status",
  asyncHandler(async (req, res) => {
    /**
     * Returns outage status for a customer by postcode.
     *
     * Query params:
     * - postcode (string, required): customer's postcode (e.g. "2000" or "SW1A 1AA")
     *
     * Response: CustomerStatusLookupResponse
     * - status: "outage" | "no_outage"
     * - severity: "low" | "medium" | "high" | "critical" | null
     * - eta: ISO timestamp string | null
     * - lastUpdated: ISO timestamp string
     *
     * Error responses:
     * - 400 if postcode is missing/invalid
     */
    const postcodeRaw = req.query.postcode;
    const parsed = postcodeSchema.safeParse(typeof postcodeRaw === "string" ? postcodeRaw : "");
    if (!parsed.success) {
      const err = new Error("Invalid postcode");
      // @ts-expect-error attach status for middleware
      err.status = 400;
      throw err;
    }

    const postcode = parsed.data.toUpperCase();

    const outage = await findActiveOutageForPostcode(postcode);
    if (!outage) {
      const payload: CustomerStatusLookupResponse = {
        status: CustomerOutageStatus.NO_OUTAGE,
        severity: null,
        eta: null,
        lastUpdated: new Date().toISOString()
      };
      return res.json(payload);
    }

    // ETA is not currently represented in schema; return null until crew dispatch/ETA calculations are added.
    const payload: CustomerStatusLookupResponse = {
      status: CustomerOutageStatus.OUTAGE,
      severity: outage.severity,
      eta: null,
      lastUpdated: outage.updatedAt
    };

    return res.json(payload);
  })
);
