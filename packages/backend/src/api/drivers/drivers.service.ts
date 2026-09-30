// Business rules for driver registration and approval status.
import { db, type DbExecutor } from '../../db';
import { AppError } from '../../common/errors/app-error';
import { isUniqueViolation } from '../../common/errors/db-errors';
import type { DriverStatus } from '../../common/types/auth.types';
import { usersService } from '../users/users.service';
import { driversRepository } from './drivers.repository';

const alreadyDriver = () =>
  new AppError(409, 'You are already registered as a driver', 'ALREADY_DRIVER');

const notADriver = () => new AppError(404, 'You are not registered as a driver', 'NOT_A_DRIVER');

/**
 * Status used when a driver account is created. The domain has no review step yet, so
 * a new driver is usable immediately; this is the single place to change when an admin
 * review is introduced.
 */
const INITIAL_DRIVER_STATUS: DriverStatus = 'approved';

/**
 * Creates the profile row. Takes an executor so signup can create the account, the
 * role and the profile in one transaction. Grants nothing: the role is the caller's
 * business, which is what lets signup and apply share this without duplicating it.
 */
async function registerProfile(userId: string, ex: DbExecutor) {
  const profile = await driversRepository.create(userId, INITIAL_DRIVER_STATUS, ex);
  if (!profile) throw new AppError(500, 'Could not create the driver profile', 'INTERNAL');
  return profile;
}

export const driversService = {
  registerProfile,

  /**
   * Turns the caller into a driver. Signup already covers opening an account as a
   * driver; this is the path for someone who signed up as a passenger and changed
   * their mind.
   *
   * An account holds exactly one role, so this **replaces** `passenger` with `driver`
   * rather than adding to it. Both writes share the caller's transaction, so a failure
   * cannot leave a user with a driver profile and a passenger role, or the reverse.
   */
  async apply(userId: string) {
    try {
      return await db.transaction(async (tx) => {
        const existing = await driversRepository.findByUserId(userId, tx);
        if (existing) throw alreadyDriver();

        const profile = await registerProfile(userId, tx);
        await usersService.setRole(userId, 'driver', tx);
        return profile;
      });
    } catch (err) {
      // The profile's primary key is the real guard against a concurrent apply.
      if (isUniqueViolation(err)) throw alreadyDriver();
      throw err;
    }
  },

  async getProfile(userId: string) {
    const profile = await driversRepository.findByUserId(userId);
    if (!profile) throw notADriver();
    return profile;
  },

  /** Admin only. Takes DriverStatus so the validation layer cannot drift from the enum. */
  async updateStatus(userId: string, status: DriverStatus) {
    const profile = await driversRepository.updateStatus(userId, status);
    if (!profile) throw new AppError(404, 'That user is not registered as a driver', 'NOT_FOUND');
    return profile;
  },

  /**
   * The driver says whether they are working right now. Purely their own column: an
   * admin changing `status` does not touch it, and vice versa.
   *
   * The "needs an active vehicle" rule is not checked here. It spans two modules and
   * `vehicles` already depends on `drivers`, so `drivers` cannot import `vehicles`; the
   * controller is the only layer that sees both. See drivers.controller.setOnline.
   */
  async setOnline(userId: string, isOnline: boolean) {
    const profile = await driversRepository.setOnline(userId, isOnline);
    if (!profile) throw notADriver();
    return profile;
  },
};
