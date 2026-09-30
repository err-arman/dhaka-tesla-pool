// Drizzle queries for `vehicles`.
//
// A driver has at most one *active* vehicle (enforced by the partial unique index
// `vehicles_one_active_per_driver`), so every query here is scoped by driverId and
// none of them take a vehicle id. Inactive rows are kept as history and are only
// ever read by findActiveByDriver.
import { and, eq } from 'drizzle-orm';
import { db, type DbExecutor } from '../../db';
import { vehicles } from '../../db/schema';

const vehicleColumns = {
  id: vehicles.id,
  driverId: vehicles.driverId,
  seats: vehicles.seats,
  isActive: vehicles.isActive,
};

export const vehiclesRepository = {
  /** The driver's current vehicle, or undefined if they have none active. */
  async findActiveByDriver(driverId: string, ex: DbExecutor = db) {
    const [row] = await ex
      .select(vehicleColumns)
      .from(vehicles)
      .where(and(eq(vehicles.driverId, driverId), eq(vehicles.isActive, true)))
      .limit(1);
    return row;
  },

  /** Existence only, for a precondition check that treats "none" as normal. */
  async hasActiveByDriver(driverId: string, ex: DbExecutor = db) {
    const [row] = await ex
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.driverId, driverId), eq(vehicles.isActive, true)))
      .limit(1);
    return Boolean(row);
  },

  /**
   * Creates the driver's vehicle. The caller is expected to have checked that none
   * is active, so hitting the unique index here is a genuine 409 rather than a
   * race the caller could have avoided.
   */
  async create(driverId: string, seats: number | undefined, ex: DbExecutor = db) {
    const [row] = await ex
      .insert(vehicles)
      .values(seats === undefined ? { driverId } : { driverId, seats })
      .returning(vehicleColumns);
    return row;
  },

  async updateActiveByDriver(
    driverId: string,
    changes: { seats?: number },
    ex: DbExecutor = db
  ) {
    const [row] = await ex
      .update(vehicles)
      .set(changes)
      .where(and(eq(vehicles.driverId, driverId), eq(vehicles.isActive, true)))
      .returning(vehicleColumns);
    return row;
  },

  /** Soft delete. The row stays so the driver can register a new one later. */
  async deactivateActiveByDriver(driverId: string, ex: DbExecutor = db) {
    const [row] = await ex
      .update(vehicles)
      .set({ isActive: false })
      .where(and(eq(vehicles.driverId, driverId), eq(vehicles.isActive, true)))
      .returning(vehicleColumns);
    return row;
  },
};
