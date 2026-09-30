/**
 * In-process integration check for request -> match -> pool lifecycle.
 *
 * Runs inside ONE `db.transaction`, which is both the rollback mechanism and the reason
 * this test can observe its own setup: every call goes through the same `tx`, so the
 * driver-online state written here is visible to matching.
 *
 * Two earlier attempts failed for the same underlying reason and are worth recording:
 *   - An HTTP version set `is_online` in a transaction while the server read through its
 *     own pool, so matching correctly saw no online driver.
 *   - Handing drizzle a raw `pg` client corrupts the wire protocol ("invalid frontend
 *     message type 0"). Passing the app's own `db` is the supported path.
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/db';
import { rideRequestsService } from '../src/api/ride-requests/ride-requests.service';
import { runMatching } from '../src/api/ride-requests/ride.matching';
import { transitionPool } from '../src/api/ride-requests/ride.pool';
import { cancelRequest } from '../src/api/ride-requests/ride.cancel';
import { feedForDriver, currentTripForDriver } from '../src/api/ride-requests/ride.driver';
import { setOnlineSchema } from '../src/api/drivers/drivers.validation';
import { locations } from '../src/db/schema';

class Rollback extends Error {}

/*
 * The outer transaction is thrown away on purpose: every assertion above is verified
 * inside it, so the driver's online flag, the new pool and the request rows all go away
 * with it. Declared before use because a `class` is not hoisted.
 */

/*
 * Run with:  bun test/rides.e2e.ts
 *
 * Exit code is the result. Everything happens inside one transaction that is rolled back
 * with a thrown sentinel, so this is safe to run against a database with real data -- it
 * creates no rows and changes no driver state. Reads are only of the seeded reference
 * data and of one existing driver/rider pair.
 */

let fail = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`);
};

const rows = async <T = Record<string, unknown>>(text: string) =>
  ((await db.execute(sql.raw(text))) as unknown as { rows: T[] }).rows;

/*
 * Baseline counts, taken before the transaction opens. The assertions at the end compare
 * against these rather than against zero: the app has real traffic, and "the tables are
 * empty afterwards" is a statement about the world, not about whether the rollback
 * worked. Zero only passes while nobody is using the app.
 */
const baselineRequests = (await rows<{ c: number }>('select count(*)::int c from ride_requests'))[0]!.c;
const baselinePools = (await rows<{ c: number }>('select count(*)::int c from pools'))[0]!.c;
const baselineOnline = (await rows<{ c: number }>(
  'select count(*)::int c from driver_profiles where is_online or current_zone_id is not null'))[0]!.c;

try {
  await db.transaction(async (tx) => {
  /*
   * `tx.execute` returns a DrizzleResult whose rows live under `.rows`; it is not itself
   * an array. Casting it to `T[]` type-checks but yields an object at runtime, so the
   * rows are unwrapped here rather than at each call site.
   */
  const q = async <T = Record<string, unknown>>(text: string) =>
    ((await tx.execute(sql.raw(text))) as unknown as { rows: T[] }).rows;

  const drivers = await q<{ id: string; email: string; seats: number }>(`
    select u.id, u.email, v.seats from users u
      join vehicles v on v.driver_id = u.id and v.is_active
     where u.is_active and u.role = 'driver' order by u.email limit 1`);
  const driver = drivers[0]!;
  check('found a driver with an active vehicle', Boolean(driver), driver.email);

  const riders = await q<{ id: string; email: string }>(
    `select id, email from users where is_active and role <> 'driver' order by email limit 1`);
  const rider = riders[0]!;
  check('found a rider', Boolean(rider), rider.email);

  const areas = await q<{ id: string; name: string }>('select id, name from locations order by name');
  const pickup = areas[0]!;
  const destination = areas[1]!;
  console.log(`\n${driver.email} (${driver.seats} seats)\n${rider.email}\n${pickup.name} -> ${destination.name}\n`);

  // --- validation -----------------------------------------------------------
  check('online + zone accepted',
    setOnlineSchema.safeParse({ isOnline: true, currentZoneId: pickup.id }).success);
  check('online WITHOUT zone rejected',
    !setOnlineSchema.safeParse({ isOnline: true }).success);
  check('offline without zone accepted',
    setOnlineSchema.safeParse({ isOnline: false }).success);

  const requestsBefore = (await q<{ c: number }>('select count(*)::int c from ride_requests'))[0]!.c;
  const poolsBefore = (await q<{ c: number }>('select count(*)::int c from pools'))[0]!.c;

  // --- no driver online: the request waits ----------------------------------
  await tx.execute(sql.raw(
    `update driver_profiles set is_online = false, current_zone_id = null where user_id = '${driver.id}'`));

  const orphan = await rideRequestsService.create(
    rider.id,
    { pickupLocationId: pickup.id, destinationLocationId: destination.id, seatsRequested: 1 },
    tx,
  );
  let orphanRow = (await q(`select status, pool_id from ride_requests where id = '${orphan.id}'`))[0]!;
  check('with no driver online it stays requested',
    orphanRow.status === 'requested' && orphanRow.pool_id === null, orphanRow);

  // --- going online triggers matching ---------------------------------------
  await tx.execute(sql.raw(
    `update driver_profiles set is_online = true, current_zone_id = '${pickup.id}' where user_id = '${driver.id}'`));

  const summary = await runMatching(tx);
  console.log(`matching: ${JSON.stringify(summary)}\n`);
  check('matching ran against the open request', summary.considered >= 1, summary);

  const matched = (await q<{ status: string; pool_id: string | null; fare_amount: number }>(
    `select status, pool_id, fare_amount from ride_requests where id = '${orphan.id}'`))[0]!;
  check('the waiting request is now matched', matched.status === 'matched' && matched.pool_id !== null, matched);
  check('a fare was assigned on match', matched.fare_amount > 0, `${matched.fare_amount} poisha`);

  const pool = (await q(`select * from pools where id = '${matched.pool_id}'`))[0] as Record<string, unknown>;
  check('pool anchored to the request areas',
    pool.pickup_location_id === pickup.id && pool.destination_location_id === destination.id);
  check('pool seats = vehicle seats - requested',
    pool.current_available_seats === driver.seats - 1,
    { avail: pool.current_available_seats, seats: driver.seats });
  check('pool starts in matched', pool.status === 'matched');
  const poolId = matched.pool_id!;

  // --- the driver feed ------------------------------------------------------
  const feed = await feedForDriver(driver.id, tx);
  check("a driver's own pool is not offered back to them",
    !feed.some((o) => o.id === poolId), `${feed.length} offers`);
  const trip = await currentTripForDriver(driver.id, tx);
  check('own pool shows as the current trip', trip?.id === poolId, trip?.status);

  // --- lifecycle ------------------------------------------------------------
  const poolStatus = async () =>
    (await q<{ status: string }>(`select status from pools where id = '${poolId}'`))[0]!.status;
  const reqStatus = async () =>
    (await q<{ status: string }>(`select status from ride_requests where id = '${orphan.id}'`))[0]!.status;

  await transitionPool(poolId, driver.id, 'accept', tx);
  check('accept -> accepted', (await poolStatus()) === 'accepted');

  await transitionPool(poolId, driver.id, 'arrive', tx);
  check('arrive -> driver_arrived', (await poolStatus()) === 'driver_arrived');

  await transitionPool(poolId, driver.id, 'start', tx);
  check('start -> started', (await poolStatus()) === 'started');
  check('passenger sees in_progress while driving', (await reqStatus()) === 'in_progress', await reqStatus());

  await transitionPool(poolId, driver.id, 'complete', tx);
  check('complete -> completed', (await poolStatus()) === 'completed');
  check('passenger request completed', (await reqStatus()) === 'completed', await reqStatus());

  // --- illegal transitions --------------------------------------------------
  let illegal: { status?: number; code?: string } | undefined;
  try {
    await transitionPool(poolId, driver.id, 'start', tx);
  } catch (error) {
    illegal = error as { status?: number; code?: string };
  }
  check('a completed pool cannot be started again -> 409', illegal?.status === 409, illegal);
  check('the refused transition changed nothing', (await poolStatus()) === 'completed');

  // --- ownership ------------------------------------------------------------
  const other = (await q<{ id: string }>(`
    select u.id from users u join vehicles v on v.driver_id = u.id and v.is_active
     where u.is_active and u.role = 'driver' and u.id <> '${driver.id}' limit 1`))[0];
  if (other) {
    let notFound: { status?: number } | undefined;
    try {
      await transitionPool(poolId, other.id, 'accept', tx);
    } catch (error) {
      notFound = error as { status?: number };
    }
    check("another driver's pool -> 404", notFound?.status === 404, notFound);
  }

  // --- cancellation by the passenger ----------------------------------------
  /*
   * Two passengers share one pool, then one leaves. This is the case worth testing,
   * because it is the one with a consequence that is easy to get wrong: the group
   * discount is a function of the headcount, so when someone leaves, the passenger who
   * stays pays MORE than they did a moment ago. A cancel that only freed the seat and
   * left the fare alone would keep charging a shared rate to a solo ride.
   *
   * Both riders are chosen with no live request, because `ride_requests_one_live_per_
   * passenger` would otherwise refuse the first POST with a 409 and the test would be
   * measuring the wrong thing.
   */
  const sharers = await q<{ id: string; email: string }>(`
    select u.id, u.email from users u
     where u.is_active and u.role <> 'driver'
       and not exists (select 1 from ride_requests r
                        where r.passenger_id = u.id
                          and r.status in ('requested','matched','in_progress'))
     order by u.email limit 2`);

  if (sharers.length < 2) {
    check('two free riders available for the cancellation tests', false, sharers.length);
  } else {
    const [leaver, stayer] = sharers as [typeof sharers[0], typeof sharers[0]];

    const reqLeaver = await rideRequestsService.create(
      leaver.id,
      { pickupLocationId: pickup.id, destinationLocationId: destination.id, seatsRequested: 1 },
      tx,
    );
    const reqStayer = await rideRequestsService.create(
      stayer.id,
      { pickupLocationId: pickup.id, destinationLocationId: destination.id, seatsRequested: 1 },
      tx,
    );

    await runMatching(tx);

    const rowOf = async (id: string) =>
      (await q<{ status: string; pool_id: string | null; fare_amount: number }>(
        `select status, pool_id, fare_amount from ride_requests where id = '${id}'`))[0]!;

    const before = await rowOf(reqStayer.id);
    check('both passengers ended up in the same pool',
      before.pool_id !== null && before.pool_id === (await rowOf(reqLeaver.id)).pool_id, before.pool_id);
    check('both are matched', before.status === 'matched' && (await rowOf(reqLeaver.id)).status === 'matched');

    const sharedPoolId = before.pool_id!;
    const sharedPool = () => q<{ status: string; current_available_seats: number }>(
      `select status, current_available_seats from pools where id = '${sharedPoolId}'`);

    const seatsWhileShared = (await sharedPool())[0]!;
    check('two seats taken from the pool',
      seatsWhileShared.current_available_seats === driver.seats - 2, seatsWhileShared);

    // --- the passenger leaves ------------------------------------------------
    const status = await cancelRequest(leaver.id, reqLeaver.id, tx);
    check('cancelling a matched request succeeds', status === 'cancelled', status);

    const leaverRow = await rowOf(reqLeaver.id);
    check('the cancelled request keeps its pool id as a record',
      leaverRow.status === 'cancelled' && leaverRow.pool_id === sharedPoolId, leaverRow);

    const afterLeave = (await sharedPool())[0]!;
    check('the seat came back',
      afterLeave.current_available_seats === driver.seats - 1, afterLeave);
    check('the pool survives -- the stayer is still on it', afterLeave.status === 'matched');

    const stayerAfter = await rowOf(reqStayer.id);
    check('the remaining passenger is re-priced for a solo ride',
      stayerAfter.fare_amount > before.fare_amount,
      { shared: before.fare_amount, solo: stayerAfter.fare_amount });
    check('the stayer is untouched otherwise',
      stayerAfter.status === 'matched' && stayerAfter.pool_id === sharedPoolId, stayerAfter);

    // --- an emptied pool is cancelled ---------------------------------------
    await cancelRequest(stayer.id, reqStayer.id, tx);
    const emptied = (await sharedPool())[0]!;
    check('cancelling the last member cancels the pool', emptied.status === 'cancelled', emptied);
    check('and every seat is back', emptied.current_available_seats === driver.seats, emptied);

    /*
     * The freed vehicle is the point of cancelling an emptied pool: with
     * `pools_one_open_per_vehicle` still holding a `cancelled` row, this driver could
     * never pick anyone up again.
     */
    const released = (await q<{ c: number }>(`
      select count(*)::int c from pools
       where vehicle_id = (select id from vehicles where driver_id = '${driver.id}' and is_active)
         and status in ('matched','accepted','driver_arrived','started')`))[0]!;
    check('the driver has no live pool left and can be matched again', released.c === 0, released);

    // --- cancelling what you may not ----------------------------------------
    const again = await cancelRequest(leaver.id, reqLeaver.id, tx).catch(
      (e) => e as { status?: number });
    check('cancelling twice -> 409', (again as { status?: number }).status === 409, again);

    const notMine = await cancelRequest(stayer.id, reqLeaver.id, tx).catch(
      (e) => e as { status?: number });
    check("cancelling someone else's request -> 404",
      (notMine as { status?: number }).status === 404, notMine);

    // --- once the trip is underway it is the driver's to end ------------------
    const reqLive = await rideRequestsService.create(
      leaver.id,
      { pickupLocationId: pickup.id, destinationLocationId: destination.id, seatsRequested: 1 },
      tx,
    );
    await runMatching(tx);
    const livePoolId = (await rowOf(reqLive.id)).pool_id!;
    await transitionPool(livePoolId, driver.id, 'accept', tx);
    await transitionPool(livePoolId, driver.id, 'arrive', tx);
    await transitionPool(livePoolId, driver.id, 'start', tx);
    check('the passenger is in_progress', (await rowOf(reqLive.id)).status === 'in_progress');

    const tooLate = await cancelRequest(leaver.id, reqLive.id, tx).catch(
      (e) => e as { status?: number });
    check('cancelling once the car is moving -> 409',
      (tooLate as { status?: number }).status === 409, tooLate);
    check('the refused cancel left it in_progress',
      (await rowOf(reqLive.id)).status === 'in_progress');

    /*
     * `stayer`, not `leaver`: `leaver` is the one in the `in_progress` trip above and is
     * correctly blocked. `stayer` holds nothing but a cancelled request, so booking again
     * has to work -- which is the whole reason the one-live-request index is partial
     * rather than a plain unique constraint on passenger_id.
     */
    const afterCancel = await rideRequestsService.create(
      stayer.id,
      { pickupLocationId: pickup.id, destinationLocationId: destination.id, seatsRequested: 1 },
      tx,
    );
    check('a cancelled request no longer blocks a new booking',
      Boolean(afterCancel.id) && (await rowOf(afterCancel.id)).status !== 'cancelled',
      (await rowOf(afterCancel.id)).status);
  }

  // --- the transaction rolls back -------------------------------------------
  const requestsDuring = (await q<{ c: number }>('select count(*)::int c from ride_requests'))[0]!.c;
  const poolsDuring = (await q<{ c: number }>('select count(*)::int c from pools'))[0]!.c;
  check('work happened inside the transaction',
    requestsDuring > requestsBefore && poolsDuring > poolsBefore,
    { requests: `${requestsBefore}->${requestsDuring}`, pools: `${poolsBefore}->${poolsDuring}` });

    throw new Rollback();
  });
} catch (error) {
  /*
   * The `Rollback` sentinel is how this test undoes its work: throwing out of the
   * transaction makes drizzle issue a ROLLBACK, so every row, pool and `is_online` flag
   * written above disappears. Anything else escaping is a real failure and is rethrown
   * rather than being mistaken for the expected rollback.
   */
  if (!(error instanceof Rollback)) throw error;
}

const afterRequests = await rows<{ c: number }>('select count(*)::int c from ride_requests');
const afterPools = await rows<{ c: number }>('select count(*)::int c from pools');
const onlineLeft = await rows<{ c: number }>(
  'select count(*)::int c from driver_profiles where is_online or current_zone_id is not null');

console.log(
  `\nbaseline: ride_requests=${baselineRequests} pools=${baselinePools} drivers-online=${baselineOnline}\n`
  + `after rollback: ride_requests=${afterRequests[0]!.c} pools=${afterPools[0]!.c} drivers-online=${onlineLeft[0]!.c}`);

check('rollback restored ride_requests', afterRequests[0]!.c === baselineRequests,
  { was: baselineRequests, now: afterRequests[0]!.c });
check('rollback restored pools', afterPools[0]!.c === baselinePools,
  { was: baselinePools, now: afterPools[0]!.c });
check('rollback left no driver online', onlineLeft[0]!.c === baselineOnline,
  { was: baselineOnline, now: onlineLeft[0]!.c });

void locations;
console.log(`\n${fail === 0 ? 'ALL PASS' : `${fail} FAILURE(S)`}`);
process.exit(fail === 0 ? 0 : 1);
