// The pool lifecycle, driven by the driver.
//
// One state machine, one entry point. Every transition goes through `transition`, so the
// legal-from-states live in exactly one table and it is impossible to add a route that
// skips a step -- a new endpoint picks a `from` list and gets the guard for free.
//
// The order is deliberate and matches what a passenger expects to see:
//   matched       a pool exists and is offered to the driver (nobody has agreed yet)
//   accepted      the driver tapped Accept
//   driver_arrived the driver is at the pickup and is waiting
//   started       everyone is in the car and moving
//   completed     the trip ended
//
// `matched` and `accepted` are separate because the pool is visible to the driver while
// it is still `matched`. Collapsing them would mean the driver saw a trip that was
// already, in the database, one they had accepted.
import { and, eq, inArray } from 'drizzle-orm';
import { db, type DbExecutor } from '../../db';
import { pools, rideRequests, vehicles } from '../../db/schema';
import { AppError } from '../../common/errors/app-error';

/**
 * The pool statuses this module owns.
 *
 * `cancelled` is absent on purpose. A *passenger* cancelling their own seat is implemented,
 * in `ride.cancel.ts`; it is not here because every entry point below proves the caller
 * owns the vehicle, and a passenger has no vehicle to prove. Putting it here would add a
 * second, differently-permissioned path into the same status column.
 *
 * A *driver* cancelling is genuinely undefined -- abandoning passengers who are already in
 * the car needs a rule about where they go and whether they are refunded -- so no driver
 * action reaches it.
 */
export type DriverPoolAction = 'accept' | 'arrive' | 'start' | 'complete';

/**
 * The only place the legal transitions are written down.
 *
 * Keyed by action, not by state, because the routes are actions ("the driver tapped
 * Accept") and a driver never names a target state. `to` is implied by the action, so a
 * caller cannot ask for `accept -> started` by accident.
 */
const TRANSITIONS: Record<DriverPoolAction, { from: PoolStatus[]; to: PoolStatus }> = {
  accept: { from: ['matched'], to: 'accepted' },
  arrive: { from: ['accepted'], to: 'driver_arrived' },
  start: { from: ['driver_arrived'], to: 'started' },
  complete: { from: ['started'], to: 'completed' },
};

type PoolStatus =
  | 'matched'
  | 'accepted'
  | 'driver_arrived'
  | 'started'
  | 'completed'
  | 'cancelled';

/** The statuses in which a trip is still under way. */
const LIVE: PoolStatus[] = ['matched', 'accepted', 'driver_arrived', 'started'];

/**
 * Fails the caller for a transition that is not legal from the pool's current state.
 *
 * 409 rather than 400 or 404: the request was well-formed and the resource exists, the
 * problem is the state it is in. The message names the state so the UI can tell the
 * driver what happened rather than showing a generic failure.
 */
function illegal(action: DriverPoolAction, current: string) {
  return new AppError(
    409,
    `Cannot ${action} a pool that is ${current.replace('_', ' ')}`,
    'ILLEGAL_POOL_TRANSITION',
  );
}

/**
 * Moves one of the driver's own pools to the next state.
 *
 * Ownership is checked inside the same transaction as the update, and the `where` clause
 * includes the expected `from` states. That makes the check and the write atomic: two
 * taps on "Accept" from two devices cannot both succeed, because the second update
 * matches no rows and is reported as a conflict instead of silently overwriting.
 */
export async function transitionPool(
  poolId: string,
  driverUserId: string,
  action: DriverPoolAction,
  ex?: DbExecutor,
): Promise<PoolStatus> {
  const rule = TRANSITIONS[action];

  // As in `runMatching`: join a caller's transaction if given one, else open our own.
  // Nesting `db.transaction` inside an open transaction would take a second connection and
  // deadlock against the first.
  if (ex) return applyTransition(ex, poolId, driverUserId, action, rule);
  return db.transaction((tx) => applyTransition(tx, poolId, driverUserId, action, rule));
}

async function applyTransition(
  tx: DbExecutor,
  poolId: string,
  driverUserId: string,
  action: DriverPoolAction,
  rule: { from: PoolStatus[]; to: PoolStatus },
): Promise<PoolStatus> {
  {
    const pool = await lockOwnedPool(poolId, driverUserId, tx);
    if (!rule.from.includes(pool.status as PoolStatus)) throw illegal(action, pool.status);

    const updated = await tx
      .update(pools)
      .set({ status: rule.to })
      .where(
        and(
          eq(pools.id, poolId),
          inArray(pools.status, rule.from),
          eq(pools.vehicleId, pool.vehicleId),
        ),
      )
      .returning({ status: pools.status });

    // Empty means another request changed the state between the read and this write.
    if (updated.length === 0) throw illegal(action, pool.status);

    await syncMemberRequests(poolId, rule.to, tx);
    return updated[0]!.status as PoolStatus;
  }
}

/**
 * The pool, locked and proven to belong to this driver.
 *
 * `for update` matters because two of the transitions are not idempotent: without the
 * lock, two concurrent "start" taps could both read `driver_arrived` and both write
 * `started`, and the request-side fan-out below would run twice.
 *
 * The vehicle's driver is checked through a join rather than by trusting the caller,
 * because `poolId` comes from the URL and any authenticated driver could otherwise drive
 * someone else's pool.
 */
async function lockOwnedPool(poolId: string, driverUserId: string, tx: DbExecutor) {
  const [row] = await tx
    .select({ id: pools.id, status: pools.status, vehicleId: pools.vehicleId })
    .from(pools)
    .innerJoin(vehicles, eq(vehicles.id, pools.vehicleId))
    .where(and(eq(pools.id, poolId), eq(vehicles.driverId, driverUserId)))
    // `of: pools` locks only the pool row, not the joined vehicle. Locking both would
    // serialise unrelated drivers' transitions behind one row.
    .for('update', { of: pools })
    .limit(1);

  if (!row) {
    throw new AppError(404, 'No such pool for you', 'POOL_NOT_FOUND');
  }
  return row;
}

/**
 * Moves the pool's ride requests along with it.
 *
 * `ride_requests` has no direct link to `pools.status`, so the two would drift apart
 * without this. The mapping is not one-to-one: while a pool is still being offered the
 * requests are `matched`, and `driver_arrived` is a pool-only state that passengers see
 * as `in_progress`, because a passenger does not need to distinguish "the car is at the
 * curb" from "the car is moving" -- they need to know it is underway.
 */
async function syncMemberRequests(poolId: string, poolStatus: PoolStatus, tx: DbExecutor) {
  const requestStatus = toRequestStatus(poolStatus);
  if (!requestStatus) return;

  await tx
    .update(rideRequests)
    .set({ status: requestStatus })
    .where(eq(rideRequests.poolId, poolId));
}

function toRequestStatus(poolStatus: PoolStatus): 'matched' | 'in_progress' | 'completed' | null {
  switch (poolStatus) {
    // Accepting does not change a passenger's view: `matched` already says a driver was
    // found, and it was true before they accepted.
    case 'matched':
    case 'accepted':
      return 'matched';
    case 'driver_arrived':
    case 'started':
      return 'in_progress';
    case 'completed':
      return 'completed';
    // Not driver-reachable (see DriverPoolAction). A pool is only ever cancelled as a
    // consequence of its last passenger leaving, and at that point there is nobody left
    // here to update -- which is why `ride.cancel.ts` writes that status directly rather
    // than routing it through this fan-out.
    case 'cancelled':
      return null;
    default:
      return null;
  }
}

export { LIVE as LIVE_POOL_STATUSES };
