import type { RequestHandler } from "express";

export const notFound: RequestHandler = (_req, _res, next) => {
  const err = new Error("Not Found");
  // @ts-expect-error attach status
  err.status = 404;
  next(err);
};
