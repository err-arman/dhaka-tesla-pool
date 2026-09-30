import { uuid, integer, timestamp } from 'drizzle-orm/pg-core/columns';
import { pgTable, pgEnum, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from '../user/users.schema';
import { pools } from '../pool/pool.schema';
import { locations } from '../locations/locations.schema';

export const rideRequestStatusEnum = pgEnum('ride_request_status', [
  'requested',
  'matched',
  'in_progress',
  'completed',
  'cancelled',
]);

/*
 * One passenger's booking. It is the unit that carries a fare and a seat count, and it
 * points at the pool it was matched into; the pool is the unit that represents the
 * vehicle's actual journey.
 */
export const rideRequests = pgTable(
  'ride_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    passengerId: uuid('passenger_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Null only while the request is still waiting to be matched. Once set it is kept,
    // including after a cancellation, so the record of which journey the request was
    // part of survives. `set null` rather than `cascade` so removing a pool cannot
    // silently delete a passenger's trip history.
    poolId: uuid('pool_id').references(() => pools.id, { onDelete: 'set null' }),
    pickupLocationId: uuid('pickup_location_id')
      .notNull()
      .references(() => locations.id),
    destinationLocationId: uuid('destination_location_id')
      .notNull()
      .references(() => locations.id),
    // Usually 1, but the column is a count so a group booking does not need a second
    // table. The pool's `current_available_seats` is decremented by this number.
    seatsRequested: integer('seats_requested').notNull().default(1),
    status: rideRequestStatusEnum('status').notNull().default('requested'),
    /*
     * Fare in poisha, the 1/100th of a Taka, so 100 means ৳1.00. An integer, never a
     * decimal or a float: a pool's fare is split between the passengers sharing it, and
     * splitting floating point money accumulates rounding error that the passengers end
     * up overpaying. Dividing an integer of poisha is exact, so a split always sums back
     * to the original fare.
     */
    fareAmount: integer('fare_amount').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ride_requests_passenger_idx').on(t.passengerId),
    index('ride_requests_pool_idx').on(t.poolId),
    // The dispatch queue only ever reads requests that are still unmatched, and it
    // wants the oldest first, so the partial index is on `created_at` for that ordering.
    index('ride_requests_open_idx')
      .on(t.createdAt)
      .where(sql`${t.status} = 'requested'`),

    /*
     * One live trip per passenger.
     *
     * Partial, so it only constrains the states in which a trip is still under way. A
     * passenger's finished and cancelled requests stay in the table as history, and
     * without the `where` clause this index would cap them at one row for the rest of
     * their life.
     *
     * The service checks this rule before inserting so the passenger gets an explanation
     * rather than an error, but the check has a window between the read and the write in
     * which two simultaneous taps -- or the same request retried after a timeout -- would
     * both pass it. This index is what closes that window, and it is the authority: the
     * service's answer is a courtesy, this is the rule.
     */
    uniqueIndex('ride_requests_one_live_per_passenger')
      .on(t.passengerId)
      .where(sql`${t.status} in ('requested', 'matched', 'in_progress')`),
    check('ride_requests_seats_positive', sql`${t.seatsRequested} >= 1`),
    check('ride_requests_fare_not_negative', sql`${t.fareAmount} >= 0`),
    // A trip that starts and ends in the same place is always a bug, and it is one the
    // caller cannot catch on its own.
    check(
      'ride_requests_pickup_differs_from_destination',
      sql`${t.pickupLocationId} <> ${t.destinationLocationId}`
    ),
    // "populated when MATCHED" as a constraint: a request still waiting to be matched
    // cannot already belong to a pool. Without this, a bug in the matching code could
    // leave a pool counting a passenger who was never given a seat.
    check(
      'ride_requests_requested_has_no_pool',
      sql`${t.status} <> 'requested' or ${t.poolId} is null`
    ),
  ],
);
