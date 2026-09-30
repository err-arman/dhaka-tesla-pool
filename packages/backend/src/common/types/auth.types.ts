// Shared auth shapes. Role and DriverStatus are derived from the database enums
// so the enum stays the single source of truth.
import type { roleEnum, driverStatusEnum } from '../../db/schema';

export type Role = (typeof roleEnum.enumValues)[number];
export type DriverStatus = (typeof driverStatusEnum.enumValues)[number];

/**
 * The roles a client is allowed to pick for itself. `admin` is deliberately absent:
 * signup takes a role from the request body, and accepting the full enum would let
 * anyone grant themselves admin by posting {"role":"admin"}. Admins are only created
 * by `bun run make-admin`. Excluding it from the type means the narrowing is checked
 * at compile time, not only by the zod schema.
 */
export type SelfAssignableRole = Exclude<Role, 'admin'>;

/** The identity attached to a request after a token is verified. */
export interface AuthUser {
  id: string;
  roles: Role[];
}
