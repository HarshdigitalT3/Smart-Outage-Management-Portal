import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config/env.js";
import { apiRouter } from "./routes/index.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

// PUBLIC_INTERFACE
export function createApp() {
  /**
   * Creates and configures the Express application instance.
   */
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true
    })
  );
  app.use(express.json());

  app.get("/", (_req, res) => {
    res.json({ name: "Smart Outage Management Portal API", ok: true });
  });

  app.use("/api", apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
