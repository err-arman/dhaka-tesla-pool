// Rate limiters. The login one only counts failed attempts, so a user who signs in
// correctly many times is never locked out.
import rateLimit from "express-rate-limit";

const shared = {
  standardHeaders: "draft-8" as const,
  legacyHeaders: false,
};

/** Loose limit for the whole API. */
export const globalLimiter = rateLimit({
  ...shared,
  windowMs: 1000,
  limit: 120,
  message: { error: "RATE_LIMITED", message: "Too many requests, slow down" },
});

/** Login: only FAILED attempts count, which slows password guessing. */
export const loginLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: {
    error: "RATE_LIMITED",
    message: "Too many login attempts, try again later",
  },
});

/** Signup, refresh, logout: every request counts. */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 1000,
  limit: 30,
  message: {
    error: "RATE_LIMITED",
    message: "Too many requests, try again later",
  },
});
