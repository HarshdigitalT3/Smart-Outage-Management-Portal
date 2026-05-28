import { Router } from "express";
import { healthRouter } from "./health.js";
import { authRouter } from "./auth.js";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
