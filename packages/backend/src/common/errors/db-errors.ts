// Database error helpers, so services can react to a driver-level failure
// without importing node-postgres error classes.

/**
 * Postgres error 23505 = unique constraint violated.
 * Drizzle may wrap the driver error in `cause`, so check both levels.
 */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

/**
 * Name of the index or constraint that was violated, e.g. `users_email_key`.
 * Lets a caller tell a duplicate email apart from a duplicate phone number,
 * because both surface as the same 23505 code.
 */
export function uniqueConstraintName(err: unknown): string | undefined {
  const e = err as { constraint?: string; cause?: { constraint?: string } } | null;
  return e?.constraint ?? e?.cause?.constraint;
}
