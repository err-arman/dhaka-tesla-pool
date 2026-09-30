// Zod schemas for the ride-requests endpoints.
//
// A request stores two location ids and never a name, because `ride_requests` holds
// foreign keys and a display string would let what the passenger saw and what was stored
// drift apart.
import { z } from 'zod';

/**
 * Mirrors MAX_SEATS in the vehicles module, because a request can never ask for more
 * seats than the largest vehicle in the fleet can offer. A group booking that exceeds it
 * could not be matched by any pool, so rejecting it here beats accepting a request that
 * can never be fulfilled.
 */
export const MAX_REQUEST_SEATS = 4;

/**
 * The body for POST /ride-requests.
 *
 * `pickup` and `destination` are both required: there is no default pickup, and the
 * `ride_requests_pickup_differs_from_destination` check constraint means a same-area
 * trip could not be stored anyway.
 */
/** The `:poolId` path parameter on the driver's pool actions. */
export const poolParamsSchema = z.object({ poolId: z.uuid() });

/**
 * The body of POST /pools/:poolId/accept. Empty by design.
 *
 * Accept takes no payload because the driver is accepting what the feed already showed
 * them. If it took a quote id, a client could accept a fare different from the one on
 * screen, and the pool's price is derived from the request rows rather than negotiated.
 */
export const acceptPoolSchema = z.object({});

export type PoolActionPath = z.infer<typeof poolParamsSchema>;

export const createRideRequestSchema = z
  .object({
    pickupLocationId: z.uuid('Choose a pickup area'),
    destinationLocationId: z.uuid('Choose a destination area'),
    seatsRequested: z.number().int().min(1).max(MAX_REQUEST_SEATS).default(1),
  })
  // The same rule the database enforces, checked here first so the passenger gets a
  // field-level message instead of a constraint-violation error. The message is attached
  // to the destination, which is the field that was wrong.
  .refine((value) => value.pickupLocationId !== value.destinationLocationId, {
    message: 'Choose a destination different from your pickup',
    path: ['destinationLocationId'],
  });

export type CreateRideRequestInput = z.infer<typeof createRideRequestSchema>;

/**
 * `:requestId` for the cancel route.
 *
 * A bare uuid rather than a validated object, for the same reason `poolParamsSchema` is:
 * there is no body to check and a malformed id must fail as a 400 `VALIDATION_ERROR`
 * before any query runs, not as a 404 from a lookup that can never match.
 */
export const requestParamsSchema = z.object({
  requestId: z.uuid('Not a valid request id'),
});
