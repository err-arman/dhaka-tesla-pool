// Catch-all for URLs that match no route. Runs before the error handler.
import type { RequestHandler } from 'express';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'Route not found' });
};
