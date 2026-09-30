// Zod schemas for the drivers endpoints. The status list is written out here so this
// file depends only on zod; `driversService.updateStatus` takes a DriverStatus, so a
// mismatch with the database enum becomes a compile error at the controller call.
import { z } from 'zod';

export const updateStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'suspended']),
});

/** The `:userId` path parameter, checked before the body is looked at. */
export const driverParamsSchema = z.object({ userId: z.uuid() });

/**
 * The driver's own availability. A plain boolean rather than a toggle with no body, so
 * a retry sends the same thing instead of flipping the value a second time.
 *
 * `currentZoneId` is required when going online and optional when going offline, rather
 * than optional either way. Matching measures a driver's distance to a pool's pickup from
 * this value, so an online driver without one can never be offered a pool; making it
 * required at that moment surfaces the mistake to the driver instead of to nobody.
 * Going offline ignores it, because the write clears the zone regardless.
 */
export const setOnlineSchema = z
  .object({
    isOnline: z.boolean(),
    currentZoneId: z.uuid().nullish(),
  })
  .refine((value) => !value.isOnline || Boolean(value.currentZoneId), {
    message: 'Choose your current area before going online',
    path: ['currentZoneId'],
  });
