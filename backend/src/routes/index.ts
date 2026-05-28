import { Router } from "express";
import { healthRouter } from "./health.js";
import { authRouter } from "./auth.js";
import { outagesRouter } from "./outages.js";
import { crewDispatchRouter } from "./crewDispatch.js";
import { customerRouter } from "./customer.js";
import { notificationsRouter } from "./notifications.js";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(outagesRouter);
apiRouter.use(crewDispatchRouter);
apiRouter.use(customerRouter);
apiRouter.use(notificationsRouter);
