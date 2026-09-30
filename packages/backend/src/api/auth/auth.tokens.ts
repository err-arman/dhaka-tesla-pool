// Token helpers. Access tokens are signed JWTs; refresh tokens are random opaque
// strings of which only a SHA-256 hash is ever stored.
import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import type { Role } from '../../common/types/auth.types';

/**
 * Short-lived JWT. The user id goes in the standard `sub` claim and the single role
 * in `role`. This replaced a `roles: Role[]` claim; tokens minted by the old shape no
 * longer pass the payload schema in `authenticate`, so everyone re-logs-in once.
 */
export function signAccessToken(userId: string, role: Role): string {
  return jwt.sign({ role }, env.JWT_ACCESS_SECRET, {
    subject: userId,
    algorithm: 'HS256',
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}

/** Refresh token = random opaque string (NOT a JWT). Only its hash is stored. */
export const generateRefreshToken = (): string => randomBytes(48).toString('base64url');

/** SHA-256 is enough here because the token is long and random, unlike a password. */
export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export const refreshExpiresAt = (): Date =>
  new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
