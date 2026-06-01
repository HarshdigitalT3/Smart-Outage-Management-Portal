import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { dbHealthcheck } from "../db/pool.js";

export const healthRouter = Router();

healthRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    const dbOk = await dbHealthcheck();
    res.json({ ok: true, dbOk });
  })
);
