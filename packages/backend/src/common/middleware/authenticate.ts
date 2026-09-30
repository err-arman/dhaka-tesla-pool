// Verifies the `Authorization: Bearer <token>` header and attaches the caller to `req.user`.
// Use before any controller that reads `req.user`. Because Express 5 forwards thrown
// errors automatically, this middleware can throw directly.
import type { Request, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env';
import { roleEnum } from '../../db/schema';
import { AppError } from '../errors/app-error';
import type { AuthUser } from '../types/auth.types';

// Never trust the shape of a decoded token blindly: it may be signed with a
// different key from an older deployment, or hand-crafted.
const payloadSchema = z.object({
  sub: z.string(),
  roles: z.array(z.enum(roleEnum.enumValues)),
});

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError(401, 'Missing access token', 'UNAUTHORIZED');
  }

  let decoded: unknown;
  try {
    decoded = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      // The client should call POST /auth/refresh and retry.
      throw new AppError(401, 'Access token expired', 'TOKEN_EXPIRED');
    }
    throw new AppError(401, 'Invalid access token', 'UNAUTHORIZED');
  }

  const payload = payloadSchema.safeParse(decoded);
  if (!payload.success) throw new AppError(401, 'Invalid access token', 'UNAUTHORIZED');

  req.user = { id: payload.data.sub, roles: payload.data.roles };
  next();
};

/** Use inside controllers behind `authenticate`. Gives a typed user without `!`. */
export function requireUser(req: Request): AuthUser {
  if (!req.user) throw new AppError(401, 'Not authenticated', 'UNAUTHORIZED');
  return req.user;
}
