// The last middleware in the chain. Converts every thrown or rejected error into the
// standard `{ error, message }` shape. Must be registered after all routes.
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }

  // Errors raised by express.json() itself.
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'INVALID_JSON', message: 'Malformed JSON body' });
    return;
  }

  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' });
    return;
  }

  // Unexpected: log it on the server, but never leak details to the client.
  console.error(err);
  res.status(500).json({ error: 'INTERNAL', message: 'Something went wrong' });
};
