// Allows the request only if the caller's single role is one of the listed roles.
// Always register after `authenticate`, because it reads the role it places on `req.user`.
import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error';
import type { Role } from '../types/auth.types';

export const requireRole =
  (...allowed: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!allowed.includes(req.user!.role)) {
      throw new AppError(403, 'You do not have access to this resource', 'FORBIDDEN');
    }
    next();
  };
