import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";

export class StoreUnavailableError extends Error {}

export async function guardStore<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    throw new StoreUnavailableError("Redis operation failed", { cause: err });
  }
}

export function asyncHandler(
  handler: (req: Request, res: Response) => Promise<unknown>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof StoreUnavailableError) {
    console.error("store unavailable:", err.cause);
    return res.status(503).json({ error: "SERVICE_UNAVAILABLE" });
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "INVALID_JSON" });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "PAYLOAD_TOO_LARGE" });
  }
  console.error("unexpected error:", err);
  return res.status(500).json({ error: "INTERNAL_ERROR" });
};
