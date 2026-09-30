// Cancelling a request, by the passenger who made it.

import { and, eq, sql } from "drizzle-orm";
import { db, type DbExecutor } from "../../db";
import { pools, rideRequests, vehicles } from "../../db/schema";
import { AppError } from "../../common/errors/app-error";
import { repricePoolMembers } from "./ride.matching";

/** The states a passenger is still allowed to walk away from. */
const CANCELLABLE: RideRequestStatus[] = ["requested", "matched"];

type RideRequestStatus = typeof rideRequests.$inferSelect.status;

/**
 * Cancels one of the passenger's own requests.
 *
 * Returns the request's new status. Like the rest of this module's entry points it takes
 * an optional executor so a caller -- a test, or a future endpoint that needs to cancel
 * and notify atomically -- can join its own transaction instead of paying for a second
 * connection.
 */
export async function cancelRequest(
  passengerId: string,
  requestId: string,
  ex?: DbExecutor,
): Promise<RideRequestStatus> {
  if (ex) return cancelWithin(ex, passengerId, requestId);
  return db.transaction((tx) => cancelWithin(tx, passengerId, requestId));
}

async function cancelWithin(
  tx: DbExecutor,
  passengerId: string,
  requestId: string,
): Promise<RideRequestStatus> {
  /*
   * Lock ordering.
   *
   * The driver state machine locks the pool first and then updates the member requests, so
   * a cancellation that locked the request first and the pool second would invert that
   * order against a concurrent "Accept" and the two would deadlock.
   *
   * So the pool is locked first whenever there is one, and the lock order matches
   * `transitionPool`'s. Which order is needed is decided by an unlocked read, because the
   * pool id is the thing being asked about and it cannot be known without reading the row.
   * That read can be stale -- a match may have attached a pool in the meantime -- so it is
   * re-verified against the locked request below, and a request whose pool appeared in the
   * meantime is retried rather than handled on a stale assumption.
   */
  for (let attempt = 0; attempt < 2; attempt++) {
    const snapshot = await readRequest(requestId, passengerId, tx);
    if (!snapshot)
      throw new AppError(404, "No such request for you", "REQUEST_NOT_FOUND");

    if (snapshot.poolId === null) {
      // No pool, so no ordering constraint, and nothing to detach from or re-price.
      return cancelUnmatched(tx, snapshot);
    }

    // Pool first, then the request: the same order `transitionPool` uses.
    await lockPool(snapshot.poolId, tx);
    const locked = await lockRequest(requestId, passengerId, tx);
    if (!locked)
      throw new AppError(404, "No such request for you", "REQUEST_NOT_FOUND");

    // The pool appeared or changed between the read and the lock. Retry once, and the
    // second pass takes whichever branch matches the row it can actually see.
    if (locked.poolId !== snapshot.poolId) continue;

    return cancelMatched(tx, locked);
  }

  /*
   * Two attempts both saw the pool change under them, which means matching is attaching
   * this request to pools faster than we can settle on one. Rather than spin, treat it as
   * the conflict it genuinely is.
   */
  throw new AppError(
    409,
    "This request is being matched right now. Try cancelling again in a moment.",
    "REQUEST_CHANGING",
  );
}

/** Ownership is part of the lookup, so this doubles as the 404 for someone else's id. */
async function readRequest(
  requestId: string,
  passengerId: string,
  tx: DbExecutor,
) {
  const [row] = await tx
    .select()
    .from(rideRequests)
    .where(
      and(
        eq(rideRequests.id, requestId),
        eq(rideRequests.passengerId, passengerId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function lockRequest(
  requestId: string,
  passengerId: string,
  tx: DbExecutor,
) {
  const [row] = await tx
    .select()
    .from(rideRequests)
    .where(
      and(
        eq(rideRequests.id, requestId),
        eq(rideRequests.passengerId, passengerId),
      ),
    )
    .for("update")
    .limit(1);
  return row ?? null;
}

async function lockPool(poolId: string, tx: DbExecutor) {
  await tx
    .select({ id: pools.id })
    .from(pools)
    .where(eq(pools.id, poolId))
    // `of: pools` so this contends only with other pool writers, not with a driver
    // toggling their own profile.
    .for("update", { of: pools })
    .limit(1);
}

/**
 * Cancels a request that was never matched.
 *
 * The status check is repeated inside the write, so two simultaneous taps -- or a retry
 * after a timeout the client never saw the answer to -- cannot both succeed. The second
 * one matches no rows and is reported as the conflict it is.
 */
async function cancelUnmatched(
  tx: DbExecutor,
  request: typeof rideRequests.$inferSelect,
): Promise<RideRequestStatus> {
  const updated = await tx
    .update(rideRequests)
    .set({ status: "cancelled", updatedAt: sql`now()` })
    .where(
      and(
        eq(rideRequests.id, request.id),
        sql`${rideRequests.status} in ('requested', 'matched')`,
      ),
    )
    .returning({ status: rideRequests.status });

  if (updated.length === 0) throw notCancellable(request.status);
  return updated[0]!.status as RideRequestStatus;
}

/**
 * Cancels a request that is sitting in a live pool.
 *
 * `pool_id` is deliberately left pointing at the pool: the request is history now, and
 * "which car was this for" is worth keeping. That is also why every count below filters
 * on `status <> 'cancelled'` rather than on `pool_id is null`.
 */
async function cancelMatched(
  tx: DbExecutor,
  request: typeof rideRequests.$inferSelect,
): Promise<RideRequestStatus> {
  const poolId = request.poolId!;
  const pool = await lockPoolForUpdate(poolId, tx);

  if (!pool) {
    /*
     * The pool vanished under us. `pools` is never deleted by application code, so this
     * means the row was removed out from under the request; the request is `matched`
     * against nothing. Cancelling it is still the right answer, and leaving it `matched`
     * would strand the passenger in a permanently undismissable state.
     */
    return cancelUnmatched(tx, request);
  }

  if (!CANCELLABLE.includes(request.status as RideRequestStatus)) {
    throw notCancellable(request.status);
  }

  /*
   * The trip has physically begun, so the passenger is no longer cancellable. Checked
   * against the *pool* as well as the request, because the pool is the authority on
   * whether the car has moved: the fan-out below keeps the two in step, but a pool that
   * has started while its member still reads `matched` would otherwise let a passenger
   * walk out of a car that is driving away.
   */
  if (!CANCELLABLE.includes(pool.status as RideRequestStatus)) {
    throw new AppError(
      409,
      "This ride has already started, so it can no longer be cancelled.",
      "REQUEST_NOT_CANCELLABLE",
    );
  }

  const cancelled = await tx
    .update(rideRequests)
    .set({ status: "cancelled", updatedAt: sql`now()` })
    .where(
      and(
        eq(rideRequests.id, request.id),
        sql`${rideRequests.status} in ('requested', 'matched')`,
      ),
    )
    .returning({ status: rideRequests.status });

  if (cancelled.length === 0) throw notCancellable(request.status);

  /*
   * Hand the seats back. `least(..., seats)` rather than a plain addition: the seats were
   * taken by a request that was counted, so this cannot exceed the vehicle's capacity, and
   * clamping means a double-cancel cannot inflate the count into space that does not
   * exist. The status guard above is what actually prevents the double.
   */
  await tx
    .update(pools)
    .set({
      currentAvailableSeats: sql`least(
        ${pools.currentAvailableSeats} + ${request.seatsRequested},
        ${pool.seats}
      )`,
      updatedAt: sql`now()`,
    })
    .where(eq(pools.id, poolId));

  const remaining = await repricePoolMembers(poolId, tx);

  /*
   * Nobody left: the driver's trip is now empty. Cancelling the pool takes it out of the
   * driver feed instead of leaving them holding a live trip with a phantom passenger, and
   * releases `pools_one_open_per_vehicle` so the driver can pick up someone new.
   */
  if (remaining === 0) {
    await tx
      .update(pools)
      .set({ status: "cancelled", updatedAt: sql`now()` })
      .where(eq(pools.id, poolId));
  }

  return cancelled[0]!.status as RideRequestStatus;
}

/**
 * The pool, locked, with the vehicle's seat count alongside it.
 *
 * `pools` stores only what is *left* (`current_available_seats`), never the capacity it
 * started from, so the vehicle is joined to get the ceiling the seat return is clamped to.
 * `of: pools` keeps the lock to the pool row, so this does not block on an unrelated
 * driver's vehicle row.
 */
async function lockPoolForUpdate(poolId: string, tx: DbExecutor) {
  const [row] = await tx
    .select({ id: pools.id, status: pools.status, seats: vehicles.seats })
    .from(pools)
    .innerJoin(vehicles, eq(vehicles.id, pools.vehicleId))
    .where(eq(pools.id, poolId))
    .for("update", { of: pools })
    .limit(1);
  return row ?? null;
}

function notCancellable(current: string) {
  const terminal = current === "completed" || current === "cancelled";
  return new AppError(
    409,
    terminal
      ? `This ride is already ${current}, so it cannot be cancelled.`
      : "This ride has already started, so it can no longer be cancelled.",
    "REQUEST_NOT_CANCELLABLE",
  );
}
