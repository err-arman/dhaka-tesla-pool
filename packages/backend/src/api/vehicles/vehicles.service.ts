// Business rules for the vehicles a driver manages.
import { AppError } from '../../common/errors/app-error';
import { vehiclesRepository } from './vehicles.repository';
import type { CreateVehicleInput, UpdateVehicleInput } from './vehicles.validation';

// A vehicle that exists but belongs to someone else is reported as 404, not 403,
// so the response does not confirm that the id is real.
const notFound = () => new AppError(404, 'Vehicle not found', 'NOT_FOUND');

export const vehiclesService = {
  async create(driverId: string, input: CreateVehicleInput) {
    const vehicle = await vehiclesRepository.create(driverId, input.seats);
    if (!vehicle) throw new AppError(500, 'Could not create the vehicle', 'INTERNAL');
    return vehicle;
  },

  list(driverId: string) {
    return vehiclesRepository.listByDriver(driverId);
  },

  async update(driverId: string, id: string, input: UpdateVehicleInput) {
    const vehicle = await vehiclesRepository.updateOwnedById(id, driverId, input);
    if (!vehicle) throw notFound();
    return vehicle;
  },

  /** Soft delete: the row stays, it is just no longer offered. */
  async deactivate(driverId: string, id: string) {
    const vehicle = await vehiclesRepository.updateOwnedById(id, driverId, { isActive: false });
    if (!vehicle) throw notFound();
    return vehicle;
  },
};
