import { uuid, integer, timestamp } from 'drizzle-orm/pg-core/columns';
import { pgTable, pgEnum, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { vehicles } from '../vehicles/vehicles.schema';
import { locations } from '../locations/locations.schema';

/*
 * `matched` and `accepted` are deliberately separate states.
 *
 * The first version of this enum had a single `matched_accepted`, which cannot work: a
 * pool has to be visible to a driver *before* they tap Accept, so "grouped and waiting
 * for a driver" and "the driver said yes" are two different moments and the Accept
 * button needs a valid from-state. `matched` is the offer; `accepted` is the driver's
 * answer.
 */
export const poolStatusEnum = pgEnum('pool_status', [
  'matched',
  'accepted',
  'driver_arrived',
  'started',
  'completed',
  'cancelled',
]);

/*
 * A pool is one physical journey by one vehicle. Every ride request matched to it rides
 * the same car over the same time window, which is what makes a shared trip one row here
 * rather than a row per passenger.
 *
 * The pickup and destination are the *anchor* of the group, taken from the request that
 * opened the pool. They are not the route: each passenger has their own destination in
 * `ride_requests`, and a later passenger joins only when their destination is within
 * `MAX_JOIN_DISTANCE_KM` of this anchor. So these two columns answer "where is this pool
 * working", not "where does the car go".
 */
export const pools = pgTable(
  'pools',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    pickupLocationId: uuid('pickup_location_id')
      .notNull()
      .references(() => locations.id),
    destinationLocationId: uuid('destination_location_id')
      .notNull()
      .references(() => locations.id),
    status: poolStatusEnum('status').notNull().default('matched'),
    /*
     * Remaining capacity, held on the pool instead of being derived with a SUM on every
     * read. Matching has to answer "does this open pool still have room" for each open
     * pool on each incoming request, which is the hot path of the whole feature.
     *
     * The value is always `vehicles.seats` minus the seats taken by the ride requests
     * attached to this pool, so it has to be written in the same transaction that changes
     * a request's status. A pool that oversubscribes is the failure this column exists
     * to make visible.
     */
    currentAvailableSeats: integer('current_available_seats').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('pools_vehicle_idx').on(t.vehicleId),
    index('pools_status_idx').on(t.status),
    // The pickup anchor is what a driver is measured against when a pool is offered, and
    // a driver's feed is a query on this column, so it is indexed rather than scanned.
    index('pools_pickup_location_idx').on(t.pickupLocationId),
    // A vehicle cannot be on two journeys at once. Restricted to the states in which a
    // journey is still live, so the history of completed and cancelled pools does not
    // collide with the constraint. The same partial-index trick as
    // `vehicles_one_active_per_driver`.
    uniqueIndex('pools_one_open_per_vehicle')
      .on(t.vehicleId)
      .where(
        sql`${t.status} in ('matched', 'accepted', 'driver_arrived', 'started')`
      ),
    check('pools_seats_not_negative', sql`${t.currentAvailableSeats} >= 0`),
    // A trip from an area to itself is never a pool. Mirrors the same rule on
    // `ride_requests`; the group's anchor is one passenger's request, so the same
    // invalid pair could otherwise reach the pool.
    check(
      'pools_pickup_differs_from_destination',
      sql`${t.pickupLocationId} <> ${t.destinationLocationId}`
    ),
  ],
);
