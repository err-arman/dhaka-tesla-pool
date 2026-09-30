// Turning open requests into pools.
//
// The whole engine is one pass over the waiting requests, oldest first, inside a single
// transaction. There is no queue table and no background worker: matching runs when a
// request arrives and when a driver comes online, which is exactly when the set of
// possible matches can have changed. Anything more would need a scheduler and a way to
// stop, for no gain at this size.

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, type DbExecutor } from "../../db";
import {
  driverProfiles,
  locations,
  pools,
  rideRequests,
  vehicles,
} from "../../db/schema";
import { haversineKm, isWithinKm } from "../../common/geo/distance";
import { farePoisha, MAX_JOIN_DISTANCE_KM } from "./ride.fare";

/**
 * Picks up every waiting request and tries to place it.
 *
 * Returns a summary rather than throwing on a partial match: one request that cannot be
 * placed -- no driver online, no seats left, nobody nearby -- is the expected steady
 * state of a ride service, not an error. The caller logs the numbers and moves on.
 */
export async function runMatching(ex?: DbExecutor): Promise<MatchingSummary> {
  /*
   * When `ex` is a transaction, the work joins it; otherwise a fresh one is opened.
   *
   * This exists so matching can be composed into a caller's transaction. Without it every
   * caller has to accept that matching runs on a separate connection, which makes the
   * write set impossible to reason about atomically: a driver coming online and the
   * matching that follows could interleave with another driver's, and a test could not
   * set up state and observe the result on one connection.
   *
   * `db.transaction` is deliberately not used for the outer case when a transaction is
   * already open -- nesting would take a second connection and deadlock against the
   * first, which is exactly the bug this signature avoids.
   */
  if (ex) return matchWithin(ex);
  return db.transaction(matchWithin);
}

async function matchWithin(tx: DbExecutor): Promise<MatchingSummary> {
  const open = await tx
    .select()
    .from(rideRequests)
    .where(eq(rideRequests.status, "requested"))
    // `for` locks the selected rows, so it has to precede `orderBy` in the builder
    // chain -- the reverse order emits the lock clause in the wrong place.
    .for("update", { skipLocked: true })
    .orderBy(asc(rideRequests.createdAt));

  const summary: MatchingSummary = {
    considered: open.length,
    matched: 0,
    stillWaiting: 0,
    poolsCreated: 0,
  };
  if (open.length === 0) return summary;

  const areaCache = new Map<string, { lat: number; lng: number }>();
  async function area(id: string, ex: DbExecutor) {
    const cached = areaCache.get(id);
    if (cached) return cached;
    const [row] = await ex
      .select({ lat: locations.lat, lng: locations.lng })
      .from(locations)
      .where(eq(locations.id, id))
      .limit(1);
    // Missing rows are impossible while the foreign keys hold, so the null is a
    // type-satisfying default rather than a case worth handling.
    const point = { lat: row?.lat ?? 0, lng: row?.lng ?? 0 };
    areaCache.set(id, point);
    return point;
  }

  for (const request of open) {
    const pickup = await area(request.pickupLocationId, tx);
    const destination = await area(request.destinationLocationId, tx);

    /*
     * A driver's eligibility depends on where they are working, so the candidate query
     * cannot be a plain join on two `locations` aliases compared by a SQL expression:
     * the distance is Haversine over lat/lng, which is clearer and cheaper to evaluate
     * in JS than to inline as a SQL expression, and the candidate set is tiny -- the
     * online drivers, not the whole fleet.
     */
    const candidates = await tx
      .select({
        vehicleId: vehicles.id,
        seats: vehicles.seats,
        driverId: vehicles.driverId,
        currentZoneId: driverProfiles.currentZoneId,
      })
      .from(vehicles)
      .innerJoin(
        driverProfiles,
        and(
          eq(driverProfiles.userId, vehicles.driverId),
          eq(driverProfiles.isOnline, true),
          eq(driverProfiles.status, "approved"),
        ),
      )
      .where(eq(vehicles.isActive, true))
      /*
       * Locked, and this is load-bearing rather than defensive.
       *
       * Two matching passes run concurrently whenever two drivers come online at once, or
       * a request arrives while another is being matched. Each locks the `requested`
       * rows it is handling, which protects the requests, but nothing protected the
       * vehicles: both passes could read the same vehicle as pool-free and each try to
       * insert a pool for it. `pools_one_open_per_vehicle` then rejects the loser -- but
       * as a constraint violation it aborts that pass's whole transaction, taking every
       * other successful match in it down with the one that collided.
       *
       */
      .for("update", { of: vehicles })
      .orderBy(asc(vehicles.id));

    let placed = false;

    for (const vehicle of candidates) {
      // A driver cannot pick up the person they are sharing with.
      if (vehicle.driverId === request.passengerId) continue;
      if (!vehicle.currentZoneId) continue;

      const zone = await area(vehicle.currentZoneId, tx);
      if (!isWithinKm(zone, pickup, MAX_JOIN_DISTANCE_KM)) continue;

      const openPool = await findOpenPoolForVehicle(vehicle.vehicleId, tx);

      if (!openPool) {
        // False means the request asked for more seats than this vehicle has. This is
        // a property of the REQUEST, not of this driver, so the loop moves on to the
        // next candidate instead of breaking.
        if (
          !(await createPoolWith(request, vehicle.vehicleId, vehicle.seats, tx))
        ) {
          continue;
        }
        summary.poolsCreated++;
        placed = true;
        break;
      }

      // A driver may accept another passenger until arriving at pickup. Once the trip
      // has started, the vehicle is no longer available for new passengers.
      if (!["matched", "accepted"].includes(openPool.status)) continue;

      /*
       * Joining an existing pool has three separate ways to fail, and each needs a
       * different response, so they are checked in cheapest-first order.
       */
      // A join has to agree with the pool on both ends: same pickup, and a destination
      // within the threshold of the pool's anchor. Comparing against the anchor rather
      // than against the previous passenger's destination is what keeps the group from
      // drifting -- A->B plus B->C within 3 km each would otherwise chain across a
      // distance nobody agreed to travel.
      if (openPool.pickupLocationId !== request.pickupLocationId) continue;

      const poolDestination = await area(openPool.destinationLocationId, tx);
      if (!isWithinKm(poolDestination, destination, MAX_JOIN_DISTANCE_KM))
        continue;

      if (await attachToPool(request, openPool.id, tx)) {
        placed = true;
        break;
      }
      // Lost the race for the last seats: another vehicle may still work.
    }

    if (placed) summary.matched++;
    else summary.stillWaiting++;
  }

  return summary;
}

export type MatchingSummary = {
  considered: number;
  matched: number;
  stillWaiting: number;
  poolsCreated: number;
};

/**
 * The vehicle's live pool, if it has one, in any live state. `pools_one_open_per_vehicle`
 * guarantees at most one, so `.limit(1)` is not papering over a bug.
 *
 * This answers "is this vehicle already committed?", which is a different question from
 * "can this request join it?" -- the caller still has to check `status` before joining.
 */
async function findOpenPoolForVehicle(vehicleId: string, tx: DbExecutor) {
  const [pool] = await tx
    .select()
    .from(pools)
    .where(
      and(
        eq(pools.vehicleId, vehicleId),
        inArray(pools.status, [
          "matched",
          "accepted",
          "driver_arrived",
          "started",
        ]),
      ),
    )
    .limit(1);
  return pool;
}

/**
 * Creates a pool around its founding request.
 *
 * The anchor pair comes from the request that opened the pool, and every later passenger
 * is compared against it. That is why `pools.pickup_location_id` and
 * `destination_location_id` are `NOT NULL`: they are the pool's definition of "where this
 * trip is going", not a summary of its members.
 */
async function createPoolWith(
  request: typeof rideRequests.$inferSelect,
  vehicleId: string,
  vehicleSeats: number,
  tx: DbExecutor,
) {
  /*
   * A request for more seats than the vehicle has cannot be pooled, and the arithmetic
   * below would produce a negative `currentAvailableSeats`. There is no check constraint
   * to catch it in time -- `pools_seats_not_negative` exists, but it fires as a constraint
   * violation that aborts the whole transaction, taking every other match in this pass
   * down with it. So the capacity is checked here, where failing costs one request.
   */
  if (request.seatsRequested > vehicleSeats) return false;

  const [pool] = await tx
    .insert(pools)
    .values({
      vehicleId,
      pickupLocationId: request.pickupLocationId,
      destinationLocationId: request.destinationLocationId,
      // The vehicle's capacity minus what this passenger takes, not the capacity itself:
      // this is a running count of room left and every join decrements it.
      currentAvailableSeats: vehicleSeats - request.seatsRequested,
    })
    .returning({ id: pools.id });

  if (!pool) return false;
  await pricePoolAndAttach(pool.id, request, tx);
  return true;
}

/**
 * Attaches a joining request and re-prices the whole pool.
 *
 * Re-pricing everything is not optional. The discount depends on how many passengers are
 * in the car, so when a second passenger joins, the FIRST passenger's fare drops too.
 * Updating only the new row would leave the founder paying the solo rate for a shared
 * ride.
 */
async function attachToPool(
  request: typeof rideRequests.$inferSelect,
  poolId: string,
  tx: DbExecutor,
): Promise<boolean> {
  /*
   * The seat check is repeated inside the write rather than trusted from the read above.
   * `pools_seats_not_negative` is the real guard: this update is an arithmetic
   * subtraction, so if two passengers were counted against the same seat concurrently
   * this is the statement that would take the count below zero. Checking the predicate
   * again turns a constraint violation -- which aborts the entire matching transaction,
   * discarding every other successful match in the same pass -- into this one request
   * simply not joining.
   */
  const remaining = await tx
    .update(pools)
    .set({
      currentAvailableSeats: sql`${pools.currentAvailableSeats} - ${request.seatsRequested}`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(pools.id, poolId),
        sql`${pools.currentAvailableSeats} >= ${request.seatsRequested}`,
      ),
    )
    .returning({ id: pools.id });

  if (remaining.length === 0) return false;

  await pricePoolAndAttach(poolId, request, tx);
  return true;
}

/**
 * Writes every request's final fare and moves them to `matched`.
 *
 * The fare is computed per passenger from that passenger's own pickup and destination,
 * so two people in one pool can legitimately pay different amounts for different
 * distances -- which is the point of charging per trip rather than splitting a pot.
 */
async function pricePoolAndAttach(
  poolId: string,
  joining: typeof rideRequests.$inferSelect,
  tx: DbExecutor,
) {
  const members = await activeMembers(poolId, tx);

  const all = members.some((m) => m.id === joining.id)
    ? members
    : [...members, { ...joining, poolId }];

  // Joining is what makes a request `matched`, and it has to be the same write that sets
  // `pool_id`: `ride_requests_requested_has_no_pool` forbids a `requested` row that already
  // points at a pool, so splitting the two would fail that check on every match.
  await writeMemberFares(poolId, all, tx, "matched");
}

/**
 * Re-prices a pool's current members without changing who is in it.
 *
 * Used when someone *leaves* rather than joins: cancelling a request shrinks the
 * passenger count, and the discount is a function of that count, so everyone left in the
 * car gets a **higher** fare, not a lower one. Re-pricing on removal is therefore as
 * necessary as re-pricing on join -- skipping it would silently keep charging a group
 * discount to a group that no longer exists.
 */
export async function repricePoolMembers(poolId: string, tx: DbExecutor) {
  const members = await activeMembers(poolId, tx);
  if (members.length === 0) return 0;
  await writeMemberFares(poolId, members, tx);
  return members.length;
}

/**
 * The pool's members, excluding anyone who has cancelled.
 *
 * A cancelled request keeps its `pool_id` -- that is what makes the record of which
 * journey it was part of survive -- so it is still *pointing at* the pool after leaving
 * it. Every count, price and seat computation here therefore has to exclude it
 * explicitly, or a departed passenger would keep occupying a seat and keep diluting the
 * discount.
 */
async function activeMembers(poolId: string, tx: DbExecutor) {
  return tx
    .select()
    .from(rideRequests)
    .where(
      and(
        eq(rideRequests.poolId, poolId),
        sql`${rideRequests.status} <> 'cancelled'`,
      ),
    );
}

/**
 * Writes each member's fare for the current headcount.
 *
 * `newStatus` is passed only when the caller is *adding* someone, because a join has to
 * move the new member to `matched` in the same statement that attaches the pool -- the
 * `ride_requests_requested_has_no_pool` check rejects a `requested` row that already
 * points at a pool, so the two cannot be separate writes.
 *
 * It is deliberately not passed when someone *leaves*. Re-pricing must never move a
 * status: the remaining passengers are still `matched`, and writing the status here would
 * quietly rewrite their journey on the strength of a cancellation.
 */
async function writeMemberFares(
  poolId: string,
  all: (typeof rideRequests.$inferSelect)[],
  tx: DbExecutor,
  newStatus?: typeof rideRequests.$inferSelect.status,
) {
  const passengerCount = all.length;

  for (const member of all) {
    const [from] = await tx
      .select({ lat: locations.lat, lng: locations.lng })
      .from(locations)
      .where(eq(locations.id, member.pickupLocationId))
      .limit(1);
    const [to] = await tx
      .select({ lat: locations.lat, lng: locations.lng })
      .from(locations)
      .where(eq(locations.id, member.destinationLocationId))
      .limit(1);

    const km = haversineKm(
      { lat: from?.lat ?? 0, lng: from?.lng ?? 0 },
      { lat: to?.lat ?? 0, lng: to?.lng ?? 0 },
    );

    await tx
      .update(rideRequests)
      .set({
        poolId,
        fareAmount: farePoisha(km, passengerCount),
        ...(newStatus ? { status: newStatus } : {}),
      })
      .where(eq(rideRequests.id, member.id));
  }
}
