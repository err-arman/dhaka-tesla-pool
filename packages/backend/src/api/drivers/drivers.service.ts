// Business rules for driver registration and approval status.
import { db } from '../../db';
import { AppError } from '../../common/errors/app-error';
import { isUniqueViolation } from '../../common/errors/db-errors';
import type { DriverStatus } from '../../common/types/auth.types';
import { usersService } from '../users/users.service';
import { driversRepository } from './drivers.repository';

const alreadyDriver = () =>
  new AppError(409, 'You are already registered as a driver', 'ALREADY_DRIVER');

const notADriver = () => new AppError(404, 'You are not registered as a driver', 'NOT_A_DRIVER');

export const driversService = {
  /** Registers the caller as a driver and grants the matching role atomically. */
  async apply(userId: string) {
    try {
      return await db.transaction(async (tx) => {
        const existing = await driversRepository.findByUserId(userId, tx);
        if (existing) throw alreadyDriver();

        // MVP: instant approval. Use 'pending' when an admin review step is added.
        const profile = await driversRepository.create(userId, 'approved', tx);
        if (!profile) throw new AppError(500, 'Could not create the driver profile', 'INTERNAL');

        await usersService.addRole(userId, 'driver', tx);
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
};
