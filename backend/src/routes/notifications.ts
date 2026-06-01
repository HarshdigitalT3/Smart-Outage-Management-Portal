import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { Roles } from "@smartoutage/shared";
import { listNotificationLogs } from "../db/notifications.js";

export const notificationsRouter = Router();

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  outageId: z.string().uuid().optional()
});

/**
 * Notification log endpoints are operator-only.
 */
notificationsRouter.use(requireAuth, requireRole(Roles.OPERATOR));

notificationsRouter.get(
  "/notifications/log",
  asyncHandler(async (req, res) => {
    /**
     * Returns notification history (email + SMS) from the DB log.
     *
     * Query:
     * - limit (int, optional, default 50, max 200)
     * - offset (int, optional, default 0)
     * - outageId (uuid, optional)
     *
     * Returns: { logs }
     */
    const q = querySchema.parse(req.query);

    const logs = await listNotificationLogs({
      limit: q.limit,
      offset: q.offset,
      outageId: q.outageId
    });

    res.json({ logs });
  })
);
