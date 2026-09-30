// Business rules for driver registration and approval status.
import { db, type DbExecutor } from '../../db';
import { AppError } from '../../common/errors/app-error';
import { isUniqueViolation } from '../../common/errors/db-errors';
import type { DriverStatus } from '../../common/types/auth.types';
import { usersService } from '../users/users.service';
import { runMatching } from '../ride-requests/ride.matching';
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
   * The driver says whether they are working right now, and where. Purely their own
   * columns: an admin changing `status` does not touch them, and vice versa.
   *
   * `currentZoneId` is required to go online and ignored to go offline. It cannot be
   * optional when online: matching measures a driver's distance to a pool's pickup from
   * this column, and an online driver with no zone is a candidate query that returns
   * nobody -- the driver would sit in the "working" state and never be offered anything,
   * with nothing on screen to explain why. Failing loudly here is better.
   *
   * The "needs an active vehicle" rule is not checked here. It spans two modules and
   * `vehicles` already depends on `drivers`, so `drivers` cannot import `vehicles`; the
   * controller is the only layer that sees both. See drivers.controller.setOnline.
   *
   * Going online runs matching afterwards, and deliberately outside this call's
   * transaction. Matching writes to `ride_requests` and `pools` and takes its own
   * transaction; nesting it inside the driver's write would hold that transaction open
   * for the whole scan of open requests for no benefit. A matching failure must not undo
   * the driver coming online -- the driver is genuinely online, and their next request
   * or the next poll will retry matching -- so the error is logged, not propagated.
   */
  async setOnline(userId: string, isOnline: boolean, currentZoneId: string | null) {
    const profile = await driversRepository.setOnline(userId, isOnline, currentZoneId);
    if (!profile) throw notADriver();

    if (isOnline) {
      try {
        const summary = await runMatching();
        console.log('[matching] after driver came online', summary);
      } catch (err) {
        console.error('[matching] failed after driver came online', err);
      }
    }

    return profile;
  },
};
