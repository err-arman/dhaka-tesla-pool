// Business rules for the single vehicle a driver manages.
//
// A driver has at most one active vehicle, enforced by the partial unique index
// `vehicles_one_active_per_driver`. These endpoints are a singleton, so nothing
// takes a vehicle id: the caller's driverId identifies the row.
import { AppError } from '../../common/errors/app-error';
import { isUniqueViolation, uniqueConstraintName } from '../../common/errors/db-errors';
import { vehiclesRepository } from './vehicles.repository';
import type { PatchVehicleInput, PutVehicleInput } from './vehicles.validation';

const noVehicle = () => new AppError(404, 'You have no active vehicle', 'NOT_FOUND');

const ALREADY_HAS_VEHICLE = 'You already have an active vehicle';

export const vehiclesService = {
  /** The caller's vehicle, or 404 if they have not registered one. */
  async get(driverId: string) {
    const vehicle = await vehiclesRepository.findActiveByDriver(driverId);
    if (!vehicle) throw noVehicle();
    return vehicle;
  },

  /**
   * Upsert: registers the vehicle if there is none, otherwise changes its seats.
   * An empty body keeps the existing seats, and registers a default when creating.
   */
  async put(driverId: string, input: PutVehicleInput) {
    const existing = await vehiclesRepository.findActiveByDriver(driverId);
    if (existing) {
      // Without a `seats` key this is a no-op write, so skip it and return as-is.
      if (input.seats === undefined) return existing;
      const updated = await vehiclesRepository.updateActiveByDriver(driverId, {
        seats: input.seats,
      });
      if (!updated) throw noVehicle();
      return updated;
    }

    try {
      const created = await vehiclesRepository.create(driverId, input.seats);
      if (!created) throw new AppError(500, 'Could not create the vehicle', 'INTERNAL');
      return created;
    } catch (err) {
      /*
       * Two concurrent PUTs can both read "no vehicle" and both try to insert. The
       * index is the real guard, and the loser gets a 409 rather than a 500.
       */
      if (
        isUniqueViolation(err) &&
        uniqueConstraintName(err) === 'vehicles_one_active_per_driver'
      ) {
        throw new AppError(409, ALREADY_HAS_VEHICLE, 'ALREADY_HAS_VEHICLE');
      }
      throw err;
    }
  },

  /**
   * Partial update of the vehicle they already have. Unlike `put` this never
   * creates, so a driver with nothing registered gets the same 404 as `get` and
   * the client can send them to the register form first.
   */
  async patch(driverId: string, input: PatchVehicleInput) {
    // updateActiveByDriver returns nothing when there is no active row, which is
    // the 404 case, so no read-then-write is needed here.
    const updated = await vehiclesRepository.updateActiveByDriver(driverId, {
      seats: input.seats,
    });
    if (!updated) throw noVehicle();
    return updated;
  },

  /** Soft delete: the row stays, it is just no longer offered. */
  async remove(driverId: string) {
    const vehicle = await vehiclesRepository.deactivateActiveByDriver(driverId);
    if (!vehicle) throw noVehicle();
    return vehicle;
  },

  /**
   * A yes/no answer for callers that treat "no vehicle" as a normal state rather than
   * an error. `get` throws the 404, which is right for the endpoint but wrong for a
   * cross-module precondition check.
   */
  async hasActive(driverId: string) {
    return vehiclesRepository.hasActiveByDriver(driverId);
  },
};
