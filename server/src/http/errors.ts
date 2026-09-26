import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

/**
 * An error whose `code` is safe to send to the client. The client maps codes to
 * Persian messages, so codes are stable identifiers, not prose.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    /** Sent with the error response, e.g. Retry-After on a 429. */
    readonly headers?: Record<string, string>,
  ) {
    super(code);
    this.name = "HttpError";
  }
}

export const notFound = () => new HttpError(404, "NOT_FOUND");

export const apiNotFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "NOT_FOUND" });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "INVALID_REQUEST",
      details: err.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)),
    });
    return;
  }
  if (err instanceof HttpError) {
    if (err.headers) res.set(err.headers);
    res.status(err.status).json({ error: err.code });
    return;
  }
  // body-parser errors carry a `type` and a 4xx status.
  const type = (err as { type?: string } | null)?.type;
  if (type === "entity.parse.failed") {
    res.status(400).json({ error: "INVALID_JSON" });
    return;
  }
  if (type === "entity.too.large") {
    res.status(413).json({ error: "PAYLOAD_TOO_LARGE" });
    return;
  }
  console.error(err);
  // Never leak internal messages (SQL, stack traces) to the client.
  res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
};
