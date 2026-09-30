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
 */
export const setOnlineSchema = z.object({
  isOnline: z.boolean(),
});
