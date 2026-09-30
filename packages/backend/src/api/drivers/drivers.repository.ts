// Drizzle queries for `driver_profiles`. No business rules and no HTTP errors.
import { and, eq } from 'drizzle-orm';
import { db, type DbExecutor } from '../../db';
import { driverProfiles } from '../../db/schema';
import type { DriverStatus } from '../../common/types/auth.types';

/** Every column of the profile is safe to return; there are no secrets here. */
const profileColumns = {
  userId: driverProfiles.userId,
  status: driverProfiles.status,
  isOnline: driverProfiles.isOnline,
  currentZoneId: driverProfiles.currentZoneId,
  createdAt: driverProfiles.createdAt,
};

export const driversRepository = {
  async findByUserId(userId: string, ex: DbExecutor = db) {
    const [row] = await ex.select(profileColumns).from(driverProfiles).where(eq(driverProfiles.userId, userId)).limit(1);
    return row;
  },

  /** Used by the approved-driver guard, which only needs a yes/no answer. */
  async hasApprovedProfile(userId: string, ex: DbExecutor = db) {
    const [row] = await ex
      .select({ userId: driverProfiles.userId })
      .from(driverProfiles)
      .where(and(eq(driverProfiles.userId, userId), eq(driverProfiles.status, 'approved')))
      .limit(1);
    return Boolean(row);
  },

  async create(userId: string, status: DriverStatus, ex: DbExecutor = db) {
    const [row] = await ex
      .insert(driverProfiles)
      .values({ userId, status })
      .returning(profileColumns);
    return row;
  },

  async updateStatus(userId: string, status: DriverStatus, ex: DbExecutor = db) {
    const [row] = await ex
      .update(driverProfiles)
      .set({ status })
      .where(eq(driverProfiles.userId, userId))
      .returning(profileColumns);
    return row;
  },

  /**
   * Availability and where the driver is working, written together.
   *
   * Going offline clears `currentZoneId` in the same statement rather than in the
   * service, because a stale zone left behind is not a cosmetic problem: matching only
   * reads `isOnline`, so a zone without an online flag is harmless -- but a driver who
   * comes back online without restating their location would be matched against wherever
   * they were hours ago. Tying the two writes together makes the invariant "online
   * implies a known current zone" impossible to violate from this path.
   */
  async setOnline(userId: string, isOnline: boolean, currentZoneId: string | null, ex: DbExecutor = db) {
    const [row] = await ex
      .update(driverProfiles)
      .set(isOnline ? { isOnline, currentZoneId } : { isOnline, currentZoneId: null })
      .where(eq(driverProfiles.userId, userId))
      .returning(profileColumns);
    return row;
  },
};
