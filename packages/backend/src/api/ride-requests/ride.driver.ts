// What a driver is offered, and how they respond.
//
// The feed is derived rather than stored: "pools near me" is a question about the
// driver's current zone and the pool's pickup anchor, both of which are already columns.
// There is no `pool_offers` table, so a pool can never be offered to a driver who is out
// of range and a driver's feed cannot go stale relative to the pools table.
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db, type DbExecutor } from '../../db';
import { driverProfiles, locations, pools, rideRequests, vehicles } from '../../db/schema';
import { haversineKm, isWithinKm } from '../../common/geo/distance';
import { MAX_JOIN_DISTANCE_KM } from './ride.fare';
import { transitionPool, type DriverPoolAction } from './ride.pool';
import { AppError } from '../../common/errors/app-error';

/**
 * The driver's current feed: live pools whose pickup is within range of where they are.
 *
 * Returns an empty list rather than 404 when there is nothing. "No work right now" is the
 * normal state of a driver who has just come online, and it is not an error.
 */
export async function feedForDriver(driverUserId: string, ex: DbExecutor = db) {
  const [driver] = await ex
    .select({ currentZoneId: driverProfiles.currentZoneId, isOnline: driverProfiles.isOnline })
    .from(driverProfiles)
    .where(eq(driverProfiles.userId, driverUserId))
    .limit(1);

  if (!driver) throw new AppError(404, 'You are not registered as a driver', 'NOT_A_DRIVER');
  if (!driver.isOnline || !driver.currentZoneId) return [];

  const [vehicle] = await ex
    .select({ id: vehicles.id, seats: vehicles.seats })
    .from(vehicles)
    .where(and(eq(vehicles.driverId, driverUserId), eq(vehicles.isActive, true)))
    .limit(1);
  if (!vehicle) return [];

  const candidates = await ex
    .select({
      id: pools.id,
      status: pools.status,
      pickupLocationId: pools.pickupLocationId,
      destinationLocationId: pools.destinationLocationId,
      currentAvailableSeats: pools.currentAvailableSeats,
      createdAt: pools.createdAt,
      pickupLat: locations.lat,
      pickupLng: locations.lng,
    })
    .from(pools)
    .innerJoin(locations, eq(locations.id, pools.pickupLocationId))
    .where(
      and(
        /*
         * `matched` only, not `matched` + `accepted`.
         *
         * An accepted pool is already spoken for, and showing it as an offer invites a
         * second driver to tap Accept on a trip that is taken -- which fails with a 409
         * from `transitionPool`, so the second driver's only outcome is a confusing error.
         * It is also wrong on its own terms: acceptance is the driver's commitment, and
         * a committed trip should not be up for grabs.
         *
         * The 3 km filter below then narrows this to offers the driver can actually reach.
         */
        eq(pools.status, 'matched'),
        /*
         * A driver's own pool is not an offer to them. `pools_one_open_per_vehicle`
         * already keeps a vehicle to one live pool, but it says nothing about who may
         * see it -- without this, a driver who comes online while already holding a pool
         * would find their own in-progress trip sitting in the offer list, waiting for
         * them to Accept a trip they are already driving.
         */
        sql`${pools.vehicleId} <> ${vehicle.id}`,
      ),
    )
    .orderBy(asc(pools.createdAt));

  const driverZone = await pointFor(driver.currentZoneId, ex);
  if (!driverZone) return [];

  /*
   * Filtered in JS rather than with a SQL haversine expression. The candidate set is the
   * live pools -- tens of rows at most, and bounded by the number of drivers who are
   * online -- so the arithmetic is trivial next to the query that produced them, and
   * sharing `haversineKm` with matching guarantees the two agree on the threshold.
   * Moving the threshold into SQL would mean the rule exists twice.
   */
  const nearby = candidates.filter((pool) =>
    isWithinKm(driverZone, { lat: pool.pickupLat, lng: pool.pickupLng }, MAX_JOIN_DISTANCE_KM),
  );

  return Promise.all(
    nearby.map(async (pool) => {
      const members = await ex
        .select({ id: rideRequests.id, seatsRequested: rideRequests.seatsRequested })
        .from(rideRequests)
        .where(eq(rideRequests.poolId, pool.id));

      const destination = await areaFor(pool.destinationLocationId, ex);

      return {
        id: pool.id,
        status: pool.status,
        pickupName: await nameFor(pool.pickupLocationId, ex),
        destinationName: await nameFor(pool.destinationLocationId, ex),
        /** Km, so the UI can show "1.2 km away" without re-deriving the radius. */
        distanceKm: Number(haversineKm(driverZone, { lat: pool.pickupLat, lng: pool.pickupLng }).toFixed(2)),
        currentAvailableSeats: pool.currentAvailableSeats,
        passengerCount: members.length,
        seatsWanted: members.reduce((sum, m) => sum + m.seatsRequested, 0),
        createdAt: pool.createdAt,
        destinationLat: destination?.lat ?? null,
        destinationLng: destination?.lng ?? null,
      };
    }),
  );
}

/** The driver's own active trip, across every state from `matched` to `started`. */
export async function currentTripForDriver(driverUserId: string, ex: DbExecutor = db) {
  const [vehicle] = await ex
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(and(eq(vehicles.driverId, driverUserId), eq(vehicles.isActive, true)))
    .limit(1);
  if (!vehicle) return null;

  const [pool] = await ex
    .select()
    .from(pools)
    .where(
      and(
        eq(pools.vehicleId, vehicle.id),
        inArray(pools.status, ['matched', 'accepted', 'driver_arrived', 'started']),
      ),
    )
    .orderBy(asc(pools.createdAt))
    .limit(1);
  if (!pool) return null;

  const members = await ex
    .select()
    .from(rideRequests)
    .where(eq(rideRequests.poolId, pool.id));

  return {
    id: pool.id,
    status: pool.status,
    pickupName: await nameFor(pool.pickupLocationId, ex),
    destinationName: await nameFor(pool.destinationLocationId, ex),
    currentAvailableSeats: pool.currentAvailableSeats,
    passengers: members.length,
    createdAt: pool.createdAt,
  };
}

/**
 * The driver's call on a pool. Thin on purpose: the legality of the move is decided in
 * `transitionPool`, so this layer only resolves the action and the id.
 */
export async function actOnPool(
  driverUserId: string,
  poolId: string,
  action: DriverPoolAction,
) {
  const status = await transitionPool(poolId, driverUserId, action);
  return { id: poolId, status };
}

/**
 * Two-point lookups, one row each. These run per pool in the feed, so they are written
 * as small helpers to keep the mapping above readable -- not for the performance, which is
 * irrelevant at this size and would only be premature.
 */
async function areaFor(id: string, ex: DbExecutor = db) {
  const [row] = await ex
    .select({ lat: locations.lat, lng: locations.lng })
    .from(locations)
    .where(eq(locations.id, id))
    .limit(1);
  return row;
}

async function pointFor(id: string, ex: DbExecutor = db) {
  const row = await areaFor(id, ex);
  return row ? { lat: row.lat, lng: row.lng } : null;
}

async function nameFor(id: string, ex: DbExecutor = db) {
  const [row] = await ex
    .select({ name: locations.name })
    .from(locations)
    .where(eq(locations.id, id))
    .limit(1);
  return row?.name ?? null;
}
