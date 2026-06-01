import type { ErrorRequestHandler } from "express";

type MaybeStatusError = Error & { status?: number };

// PUBLIC_INTERFACE
export const errorHandler: ErrorRequestHandler = (err: MaybeStatusError, _req, res, _next) => {
  /**
   * Express error middleware returning normalized error payloads.
   */
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  res.status(status).json({
    error: {
      message: status === 500 ? "Internal Server Error" : err.message,
      status
    }
  });
};
