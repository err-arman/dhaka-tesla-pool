// Drizzle queries for `ride_requests`.
//
// A request starts life with `pool_id` null and `fare_amount` 0, both of which the
// matching engine fills in later. Every read that a passenger can see is scoped by
// passengerId: one rider must never be able to read another's trip or fare.
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, type DbExecutor } from '../../db';
import { locations, pools, rideRequests } from '../../db/schema';

const requestColumns = {
  id: rideRequests.id,
  passengerId: rideRequests.passengerId,
  poolId: rideRequests.poolId,
  pickupLocationId: rideRequests.pickupLocationId,
  destinationLocationId: rideRequests.destinationLocationId,
  seatsRequested: rideRequests.seatsRequested,
  status: rideRequests.status,
  fareAmount: rideRequests.fareAmount,
  createdAt: rideRequests.createdAt,
  updatedAt: rideRequests.updatedAt,
};

export const rideRequestsRepository = {
  /** The two areas, so the response can carry names the UI can display. */
  async findAreaNames(ids: string[], ex: DbExecutor = db) {
    if (ids.length === 0) return [];
    return ex
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(inArray(locations.id, ids));
  },

  /**
   * The ids of the areas that exist. Used to answer "is this a real area" with a field
   * error rather than letting the foreign key reject the insert with a 500.
   */
  async existingLocationIds(ids: string[], ex: DbExecutor = db) {
    const rows = await this.findAreaNames(ids, ex);
    return rows.map((row) => row.id);
  },

  /**
   * This passenger's in-flight request, if they have one.
   *
   * "In flight" is the three states in which a trip is still under way: waiting to be
   * matched, matched, or being driven. Completed and cancelled rows are history and are
   * ignored, so a passenger who has ridden before is not blocked from riding again.
   *
   * Mirrors the predicate of the `ride_requests_one_live_per_passenger` unique index
   * exactly, so this read and the index cannot disagree about what counts as live.
   */
  async findLiveByPassenger(passengerId: string, ex: DbExecutor = db) {
    const rows = await ex
      .select({
        id: rideRequests.id,
        status: rideRequests.status,
        pickupLocationId: rideRequests.pickupLocationId,
        destinationLocationId: rideRequests.destinationLocationId,
      })
      .from(rideRequests)
      .where(
        and(
          eq(rideRequests.passengerId, passengerId),
          inArray(rideRequests.status, ['requested', 'matched', 'in_progress']),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * Creates a request in `REQUESTED`, with no pool and no fare.
   *
   * The fare is deliberately zero here rather than estimated. It is computed when the
   * request is matched, because the pool discount depends on who else is in the pool —
   * which is not knowable at submission time. Storing an estimate now would mean
   * rewriting the value later, and a passenger would briefly see a fare that is not the
   * one they are charged.
   */
  async create(
    input: {
      passengerId: string;
      pickupLocationId: string;
      destinationLocationId: string;
      seatsRequested: number;
    },
    ex: DbExecutor = db,
  ) {
    const [row] = await ex.insert(rideRequests).values(input).returning(requestColumns);
    return row;
  },

  /**
   * This passenger's own requests, newest first, with their area names. The only read
   * the ride history endpoint uses, and the reason for scoping by passengerId here
   * rather than in the service: the privacy rule is easier to keep when the query that
   * could break it takes no id at all.
   */
  async findMine(passengerId: string, ex: DbExecutor = db) {
    const mine = await ex
      .select(requestColumns)
      .from(rideRequests)
      .where(eq(rideRequests.passengerId, passengerId))
      .orderBy(desc(rideRequests.createdAt));

    if (mine.length === 0) return [];

    const areas = await this.findAreaNames(
      mine.flatMap((r) => [r.pickupLocationId, r.destinationLocationId]),
      ex,
    );
    const nameById = new Map(areas.map((a) => [a.id, a.name]));

    return mine.map((r) => ({
      ...r,
      pickupName: nameById.get(r.pickupLocationId) ?? null,
      destinationName: nameById.get(r.destinationLocationId) ?? null,
    }));
  },

  /**
   * Requests that are still waiting to be matched, oldest first. The matching engine
   * drains this list; `ride_requests_open_idx` is a partial index on
   * `created_at WHERE status = 'requested'`, which matches both halves of this query.
   */
  async findOpen(ex: DbExecutor = db) {
    return ex
      .select(requestColumns)
      .from(rideRequests)
      .where(eq(rideRequests.status, 'requested'))
      .orderBy(rideRequests.createdAt);
  },

  /** One request by id, for a state transition. Scoped by nothing: see the callers. */
  async findById(id: string, ex: DbExecutor = db) {
    const [row] = await ex
      .select(requestColumns)
      .from(rideRequests)
      .where(eq(rideRequests.id, id))
      .limit(1);
    return row;
  },

  /**
   * Every request attached to a pool. The driver pool view uses this, and so does the
   * ride history, which is why it is a pool-scoped read rather than a passenger-scoped
   * one — the privacy boundary is applied by whoever calls it.
   */
  async findByPool(poolId: string, ex: DbExecutor = db) {
    return ex
      .select(requestColumns)
      .from(rideRequests)
      .where(eq(rideRequests.poolId, poolId))
      .orderBy(rideRequests.createdAt);
  },

  /** The pickup anchor of a pool, used to measure a driver's distance to it. */
  async poolAnchor(poolId: string, ex: DbExecutor = db) {
    const [row] = await ex
      .select({
        poolId: pools.id,
        pickupLocationId: pools.pickupLocationId,
        destinationLocationId: pools.destinationLocationId,
      })
      .from(pools)
      .where(eq(pools.id, poolId))
      .limit(1);
    return row;
  },

  /** A driver's own open pools, which is what the incoming-requests page lists. */
  async findOpenByVehicle(vehicleId: string, ex: DbExecutor = db) {
    return ex
      .select({
        id: pools.id,
        status: pools.status,
        pickupLocationId: pools.pickupLocationId,
        destinationLocationId: pools.destinationLocationId,
        currentAvailableSeats: pools.currentAvailableSeats,
        createdAt: pools.createdAt,
      })
      .from(pools)
      .where(
        and(eq(pools.vehicleId, vehicleId), inArray(pools.status, ['matched', 'accepted'])),
      )
      .orderBy(pools.createdAt);
  },
};
