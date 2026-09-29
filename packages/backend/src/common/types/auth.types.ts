// Shared auth shapes. Role and DriverStatus are derived from the database enums
// so the enum stays the single source of truth.
import type { roleEnum, driverStatusEnum } from '../../db/schema';

export type Role = (typeof roleEnum.enumValues)[number];
export type DriverStatus = (typeof driverStatusEnum.enumValues)[number];

/** The identity attached to a request after a token is verified. */
export interface AuthUser {
  id: string;
  roles: Role[];
}
