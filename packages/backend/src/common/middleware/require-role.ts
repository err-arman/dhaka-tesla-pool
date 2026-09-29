// Allows the request only if the caller holds at least one of the listed roles.
// Always register after `authenticate`, because it reads the roles it places on `req.user`.
import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error';
import type { Role } from '../types/auth.types';

export const requireRole =
  (...allowed: Role[]): RequestHandler =>
  (req, _res, next) => {
    const hasRole = req.user?.roles.some((role) => allowed.includes(role));
    if (!hasRole) {
      throw new AppError(403, 'You do not have access to this resource', 'FORBIDDEN');
    }
    next();
  };
