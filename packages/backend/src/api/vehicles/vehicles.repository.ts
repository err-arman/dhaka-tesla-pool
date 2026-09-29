// Drizzle queries for `vehicles`. Every read and write is scoped by driverId so a
// driver can only ever touch their own rows.
import { and, eq } from 'drizzle-orm';
import { db, type DbExecutor } from '../../db';
import { vehicles } from '../../db/schema';

const vehicleColumns = {
  id: vehicles.id,
  driverId: vehicles.driverId,
  seats: vehicles.seats,
  isActive: vehicles.isActive,
};

type VehicleChanges = Partial<{ seats: number; isActive: boolean }>;

export const vehiclesRepository = {
  async create(driverId: string, seats: number | undefined, ex: DbExecutor = db) {
    const [row] = await ex
      .insert(vehicles)
      .values(seats === undefined ? { driverId } : { driverId, seats })
      .returning(vehicleColumns);
    return row;
  },

  async listByDriver(driverId: string, ex: DbExecutor = db) {
    return ex.select(vehicleColumns).from(vehicles).where(eq(vehicles.driverId, driverId));
  },

  /**
   * Ownership is part of the WHERE clause rather than a separate read, so a vehicle
   * belonging to someone else looks exactly like a vehicle that does not exist.
   */
  async updateOwnedById(id: string, driverId: string, changes: VehicleChanges, ex: DbExecutor = db) {
    const [row] = await ex
      .update(vehicles)
      .set(changes)
      .where(and(eq(vehicles.id, id), eq(vehicles.driverId, driverId)))
      .returning(vehicleColumns);
    return row;
  },
};
