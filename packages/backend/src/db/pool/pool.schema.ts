import { uuid, integer, timestamp } from 'drizzle-orm/pg-core/columns';
import { pgTable, pgEnum, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { vehicles } from '../vehicles/vehicles.schema';

/*
 * `matched_accepted` is a single state because the spec wrote the first state as
 * "MATCHED/ACCEPTED", which left it open whether a match is finished the moment a
 * driver is assigned or only once the driver accepts. It is modelled as one state, so a
 * driver is never silently treated as having accepted. Splitting it into
 * `matched` + `accepted` later is a one-line enum change.
 */
export const poolStatusEnum = pgEnum('pool_status', [
  'matched_accepted',
  'driver_arrived',
  'started',
  'completed',
  'cancelled',
]);

/*
 * A pool is one physical journey by one vehicle. Every ride request matched to it rides
 * the same car over the same time window, which is what makes a shared trip one row here
 * rather than a row per passenger.
 */
export const pools = pgTable(
  'pools',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    status: poolStatusEnum('status').notNull().default('matched_accepted'),
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
    // A vehicle cannot be on two journeys at once. Restricted to the states in which a
    // journey is still live, so the history of completed and cancelled pools does not
    // collide with the constraint. The same partial-index trick as
    // `vehicles_one_active_per_driver`.
    uniqueIndex('pools_one_open_per_vehicle')
      .on(t.vehicleId)
      .where(sql`${t.status} in ('matched_accepted', 'driver_arrived', 'started')`),
    check('pools_seats_not_negative', sql`${t.currentAvailableSeats} >= 0`),
  ],
);
