// Zod schemas for the vehicles endpoints.
import { z } from 'zod';

export const MIN_SEATS = 1;
export const MAX_SEATS = 4;

const seats = z.number().int().min(MIN_SEATS).max(MAX_SEATS);

export const createVehicleSchema = z.object({
  seats: seats.optional(),
});

export const updateVehicleSchema = z
  .object({
    seats: seats.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field',
  });

/** The `:id` path parameter, checked before the body is looked at. */
export const vehicleParamsSchema = z.object({ id: z.uuid() });

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
