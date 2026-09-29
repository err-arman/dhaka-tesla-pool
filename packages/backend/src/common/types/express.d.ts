// Teaches Express about `req.user`, which `authenticate` sets after verifying the access token.
import type { AuthUser } from './auth.types';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
