// Zod schemas for the vehicles endpoints.
//
// A driver has at most one active vehicle, so the resource is a singleton: there is
// no :id in any route, and every query is scoped by the caller's driverId.
import { z } from 'zod';

export const MIN_SEATS = 1;
export const MAX_SEATS = 4;

const seats = z.number().int().min(MIN_SEATS).max(MAX_SEATS);

/**
 * The body for PUT /vehicles. An empty object is valid and means "use the column
 * default", which is how a driver registers a vehicle without choosing a capacity.
 */
export const putVehicleSchema = z.object({
  seats: seats.optional(),
});

export type PutVehicleInput = z.infer<typeof putVehicleSchema>;

/**
 * The body for PATCH /vehicles. Rejects an empty object, which is what separates
 * PATCH from PUT: `PUT {}` means "register one with the default seats", while
 * `PATCH {}` would be a no-op write the caller almost certainly did not intend.
 *
 * The predicate narrows the output to `{ seats: number }`, so the service receives
 * a guaranteed value instead of re-checking what the schema already proved.
 */
export const patchVehicleSchema = z
  .object({
    seats: seats.optional(),
  })
  .refine((v): v is { seats: number } => v.seats !== undefined, {
    message: 'Send at least one field to change',
  });

export type PatchVehicleInput = z.infer<typeof patchVehicleSchema>;
