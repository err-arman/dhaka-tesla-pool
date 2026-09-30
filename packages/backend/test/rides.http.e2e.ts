/**
 * End-to-end check over real HTTP against the running server on :8080.
 *
 * Access tokens are signed with the app's own `signAccessToken`, because the sessions
 * table stores only hashed refresh tokens and no plaintext access token exists to
 * borrow. This is the same function the auth service calls after a successful login, so
 * the requests below are authenticated exactly as a browser would be.
 *
 * Leaves the database as it found it: every row and every driver flag written here is
 * deleted or restored in the `finally` block, and the count is asserted afterwards.
 */
import { Pool } from 'pg';
import { signAccessToken } from '../src/api/auth/auth.tokens';

const BASE = 'http://localhost:8080/api/v1';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async (text: string, values: unknown[] = []) => (await pool.query(text, values)).rows;

let fail = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`);
};

async function api(
  path: string,
  token: string,
  init: { method?: string; body?: unknown } = {},
) {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    // Serialised here rather than at each call site so a typed body cannot be smuggled
    // past JSON encoding.
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const drivers = await q(`
  select u.id, u.email, v.id vehicle_id, v.seats
    from users u join vehicles v on v.driver_id = u.id and v.is_active
   where u.is_active and u.role = 'driver' order by u.email limit 2`);
/*
 * A passenger with no live trip. Picking the first non-driver by email is not enough:
 * anyone who is currently mid-ride would make this test's opening POST a 409, and the
 * test would fail for a reason that has nothing to do with the code it is checking.
 */
const rider = (await q(`
  select u.id, u.email from users u
   where u.is_active and u.role <> 'driver'
     and not exists (
       select 1 from ride_requests r
        where r.passenger_id = u.id
          and r.status in ('requested', 'matched', 'in_progress'))
   order by u.email limit 1`))[0]!;
const areas = await q('select id, name from locations order by name');
const pickup = areas[0]!;
const destination = areas[1]!;

const [driverA, driverB] = drivers;
console.log(`driver A ${driverA.email} (${driverA.seats} seats)`);
console.log(`driver B ${driverB?.email ?? 'none'}`);
console.log(`rider    ${rider.email}`);
console.log(`${pickup.name} -> ${destination.name}\n`);

if (!driverB) {
  console.log('SKIP: needs two drivers with active vehicles for the offer test.');
  await pool.end();
  process.exit(0);
}

/*
 * Going online runs the matching engine over EVERY open request, not just this test's.
 * If a real passenger is waiting, this test would match them into its own pool and then
 * delete that pool in cleanup, destroying their live trip. So refuse to run while anyone
 * else is waiting, rather than quietly taking their ride.
 */
const [foreignWaiting] = await q(
  `select count(*)::int c from ride_requests where status = 'requested'`);
if (foreignWaiting.c > 0) {
  console.log(
    `SKIP: ${foreignWaiting.c} passenger(s) are waiting for a driver. Going online in this test`
    + ' would match them into a pool it then deletes. Retry once they are matched.');
  await pool.end();
  process.exit(0);
}

const tokenA = signAccessToken(driverA.id, 'driver');
const tokenB = signAccessToken(driverB.id, 'driver');
const riderToken = signAccessToken(rider.id, 'passenger');

const createdRequests: string[] = [];
const createdPools: string[] = [];

/*
 * Counts taken before anything is written, so the final assertion can prove this test
 * added and removed exactly its own rows. Asserting the tables ended up EMPTY would be
 * wrong: the app has real traffic, and deleting someone else's trip to make a test pass
 * is worse than a failing test.
 */
const baseline = {
  requests: (await q('select count(*)::int c from ride_requests'))[0]!.c,
  pools: (await q('select count(*)::int c from pools'))[0]!.c,
};
const originalFlags = new Map<string, { is_online: boolean; current_zone_id: string | null }>();

const restore = async () => {
  /*
   * Pools first, discovered from this test's own requests rather than collected as they
   * are created. Hand-tracking ids missed the second pool once this test started booking
   * two rides, and a leaked pool also leaks a `matched` status onto a deleted request.
   * `ride_requests.pool_id` is ON DELETE SET NULL, so dropping the pool before the
   * request is safe.
   */
  await pool.query(
    `delete from pools where id in (
       select pool_id from ride_requests
        where id = any($1::uuid[]) and pool_id is not null)`,
    [createdRequests],
  );
  await pool.query(`delete from ride_requests where id = any($1::uuid[])`, [createdRequests]);
  for (const [userId, flags] of originalFlags) {
    await pool.query(
      `update driver_profiles set is_online = $2, current_zone_id = $3 where user_id = $1`,
      [userId, flags.is_online, flags.current_zone_id],
    );
  }
};

try {
  for (const d of [driverA, driverB]) {
    const [row] = await q(
      `select is_online, current_zone_id from driver_profiles where user_id = $1`, [d.id]);
    originalFlags.set(d.id, row ?? { is_online: false, current_zone_id: null });
  }
  await pool.query(`update driver_profiles set is_online = false, current_zone_id = null
     where user_id = any($1::uuid[])`, [[driverA.id, driverB.id]]);

  // --- 1. submit a request with nobody online ---------------------------------
  const created = await api('/ride-requests', riderToken, {
    method: 'POST',
    body: {
      pickupLocationId: pickup.id,
      destinationLocationId: destination.id,
      seatsRequested: 1,
    },
  });
  createdRequests.push(created.body.id);
  check('POST /ride-requests -> 201', created.status === 201, created.status);
  check('response has no pool and no fare yet',
    created.body.poolId === null && created.body.fareAmount === 0 && created.body.status === 'requested');
  check('response carries both area names',
    created.body.pickupName === pickup.name && created.body.destinationName === destination.name,
    { p: created.body.pickupName, d: created.body.destinationName });

  const stillWaiting = await q(`select status, pool_id from ride_requests where id = $1`, [created.body.id]);
  check('with no driver online it waits', stillWaiting[0].status === 'requested' && stillWaiting[0].pool_id === null);

  // --- 2. driver A comes online -> matching runs ------------------------------
  const online = await api('/drivers/me/online', tokenA, {
    method: 'PATCH',
    body: { isOnline: true, currentZoneId: pickup.id },
  });
  check('PATCH /drivers/me/online -> 200', online.status === 200, online.status);
  check('profile now has the zone', online.body.isOnline === true && online.body.currentZoneId === pickup.id);

  const matched = await q(`select status, pool_id, fare_amount from ride_requests where id = $1`, [created.body.id]);
  check('coming online matched the waiting request',
    matched[0].status === 'matched' && matched[0].pool_id !== null, matched[0]);
  check('fare was set', matched[0].fare_amount > 0, `${matched[0].fare_amount} poisha`);
  createdPools.push(matched[0].pool_id);

  const poolRow = (await q(`select * from pools where id = $1`, [matched[0].pool_id]))[0]!;
  check('pool seats = vehicle seats - 1',
    poolRow.current_available_seats === driverA.seats - 1,
    { avail: poolRow.current_available_seats, seats: driverA.seats });

  // --- 3. driver A's own feed --------------------------------------------------
  const feedA = await api('/ride-requests/driver/feed', tokenA);
  check('GET /ride-requests/driver/feed -> 200', feedA.status === 200);
  check('own pool is not offered back', !feedA.body.offers.some((o: { id: string }) => o.id === poolRow.id));
  check('own pool is the current trip', feedA.body.currentTrip?.id === poolRow.id, feedA.body.currentTrip?.status);

  // --- 4. driver B sees it as an offer ---------------------------------------
  await api('/drivers/me/online', tokenB, { method: 'PATCH', body: { isOnline: true, currentZoneId: pickup.id } });
  const feedB = await api('/ride-requests/driver/feed', tokenB);
  const offer = feedB.body.offers.find((o: { id: string }) => o.id === poolRow.id);
  check('another nearby driver is offered the pool', Boolean(offer), `${feedB.body.offers.length} offers`);
  check('the offer carries both names and a distance',
    offer?.pickupName === pickup.name && typeof offer.distanceKm === 'number',
    { pickup: offer?.pickupName, km: offer?.distanceKm });

  // --- 5. the lifecycle -------------------------------------------------------
  const step = async (token: string, action: string, expect: string) => {
    const res = await api(`/ride-requests/pools/${poolRow.id}/${action}`, token, { method: 'POST' });
    check(`${action} -> ${expect}`, res.status === 200 && res.body.status === expect,
      { status: res.status, got: res.body?.status ?? res.body });
  };
  await step(tokenA, 'accept', 'accepted');
  await step(tokenA, 'arrive', 'driver_arrived');
  await step(tokenA, 'start', 'started');

  const during = await q(`select status from ride_requests where id = $1`, [created.body.id]);
  check('passenger sees in_progress while driving', during[0].status === 'in_progress', during[0].status);

  await step(tokenA, 'complete', 'completed');
  const after = await q(`select status from ride_requests where id = $1`, [created.body.id]);
  check('passenger request completed', after[0].status === 'completed', after[0].status);

  // --- 6. refusals -----------------------------------------------------------
  const repeat = await api(`/ride-requests/pools/${poolRow.id}/start`, tokenA, { method: 'POST' });
  check('starting a completed trip -> 409', repeat.status === 409, repeat.body);

  const notMine = await api(`/ride-requests/pools/${poolRow.id}/accept`, tokenB, { method: 'POST' });
  check("another driver touching it -> 404", notMine.status === 404, notMine.body);

  const badVerb = await api(`/ride-requests/pools/${poolRow.id}/teleport`, tokenA, { method: 'POST' });
  check('an unknown action -> 404', badVerb.status === 404, badVerb.body);

  // 400, not 422: `error-handler.ts` maps every ZodError to 400 VALIDATION_ERROR, and a
  // malformed path parameter is a schema failure rather than a semantic one.
  const badId = await api('/ride-requests/pools/not-a-uuid/accept', tokenA, { method: 'POST' });
  check('a non-uuid pool id -> 400 VALIDATION_ERROR',
    badId.status === 400 && badId.body?.error === 'VALIDATION_ERROR',
    { status: badId.status, error: badId.body?.error });

  // --- 7. the passenger's own history ----------------------------------------
  const mine = await api('/ride-requests/mine', riderToken);
  check('GET /ride-requests/mine lists the trip', mine.body.some((r: { id: string }) => r.id === created.body.id));
  const mineRow = mine.body.find((r: { id: string }) => r.id === created.body.id);
  check('history shows the final fare', mineRow.fareAmount > 0, mineRow.fareAmount);
  check('history shows both names',
    mineRow.pickupName === pickup.name && mineRow.destinationName === destination.name);

  const otherDriverSeesIt = await api('/ride-requests/mine', tokenA);
  check("a driver cannot read the rider's trips in /mine",
    !otherDriverSeesIt.body.some((r: { id: string }) => r.id === created.body.id));

  /*
   * One live trip per passenger. The first trip is now COMPLETED, so the passenger is
   * allowed to book again -- which is the point of the rule being status-scoped rather
   * than "one request ever".
   */
  const second = await api('/ride-requests', riderToken, {
    method: 'POST',
    body: { pickupLocationId: pickup.id, destinationLocationId: destination.id, seatsRequested: 1 },
  });
  check('a completed trip does not block a new request -> 201', second.status === 201, second.status);
  if (second.status === 201) createdRequests.push(second.body.id);

  /*
   * Cancelling an unmatched request: the simplest path, and the one a passenger is most
   * likely to hit -- they submitted, saw no driver, and changed their mind.
   */
  const third = await api('/ride-requests', riderToken, {
    method: 'POST',
    body: { pickupLocationId: pickup.id, destinationLocationId: destination.id, seatsRequested: 1 },
  });
  check('a live request blocks a new one -> 409', third.status === 409, third.status);
  const cancelledEarly = await api(`/ride-requests/${second.body.id}/cancel`, riderToken, { method: 'POST' });
  check('cancelling an unmatched request -> 200', cancelledEarly.status === 200, cancelledEarly.status);
  check('and it reports cancelled', cancelledEarly.body?.status === 'cancelled', cancelledEarly.body);

  const notMineCancel = await api(`/ride-requests/${second.body.id}/cancel`, tokenA, { method: 'POST' });
  check("a driver cannot cancel someone else's request -> 404", notMineCancel.status === 404, notMineCancel.status);

  const twice = await api(`/ride-requests/${second.body.id}/cancel`, riderToken, { method: 'POST' });
  check('cancelling twice -> 409', twice.status === 409, twice.status);

  const badCancel = await api('/ride-requests/not-a-uuid/cancel', riderToken, { method: 'POST' });
  check('a non-uuid request id -> 400 VALIDATION_ERROR',
    badCancel.status === 400 && badCancel.body?.error === 'VALIDATION_ERROR',
    { status: badCancel.status, error: badCancel.body?.error });

  // The seat is free again, so booking works -- the rule is about a trip in progress.
  const afterCancel = await api('/ride-requests', riderToken, {
    method: 'POST',
    body: { pickupLocationId: pickup.id, destinationLocationId: destination.id, seatsRequested: 1 },
  });
  check('booking again after cancelling -> 201', afterCancel.status === 201, afterCancel.status);
  if (afterCancel.status === 201) createdRequests.push(afterCancel.body.id);

  const duplicate = await api('/ride-requests', riderToken, {
    method: 'POST',
    body: { pickupLocationId: pickup.id, destinationLocationId: destination.id, seatsRequested: 1 },
  });
  check('a second live request is refused -> 409', duplicate.status === 409, duplicate.status);
  check('and it names the reason', duplicate.body?.error === 'RIDE_ALREADY_IN_PROGRESS',
    duplicate.body?.error);

  const history = await api('/ride-requests/mine', riderToken);
  const live = history.body.filter((r: { status: string }) =>
    ['requested', 'matched', 'in_progress'].includes(r.status));
  check('the passenger has exactly one live request', live.length === 1, live.length);

  /*
   * The index, not just the service check. Two inserts for the same passenger with no
   * service in the way is the lost-half-of-the-race case the partial unique index exists
   * to catch; a service-level read would let both through.
   */
  const indexBites = await (async () => {
    const p = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await p.query(
        `insert into ride_requests (passenger_id, pickup_location_id, destination_location_id, seats_requested, status)
         select passenger_id, $2, $3, 1, 'requested' from ride_requests where id = $1`,
        [second.body.id, pickup.id, destination.id],
      );
      return false;
    } catch (err) {
      return String(err).includes('ride_requests_one_live_per_passenger');
    } finally {
      await p.end();
    }
  })();
  check('the unique index rejects a concurrent second live request', indexBites, indexBites);

  // --- 8. going online needs an area -----------------------------------------
  const noZone = await api('/drivers/me/online', tokenB, { method: 'PATCH', body: { isOnline: false } });
  check('going offline needs no area', noZone.status === 200, noZone.status);
  const zoneCleared = await q(`select current_zone_id from driver_profiles where user_id = $1`, [driverB.id]);
  check('the zone is cleared on going offline', zoneCleared[0].current_zone_id === null, zoneCleared[0]);
  const missingZone = await api('/drivers/me/online', tokenB, {
    method: 'PATCH', body: { isOnline: true },
  });
  check('going online without an area -> 400, blaming currentZoneId',
    missingZone.status === 400 && missingZone.body?.issues?.[0]?.path === 'currentZoneId',
    { status: missingZone.status, path: missingZone.body?.issues?.[0]?.path });
} finally {
  await restore();
  await pool.end();
}

const leftovers = await (async () => {
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  const mine = (await p.query(
    'select count(*)::int c from ride_requests where id = any($1::uuid[])', [createdRequests],
  )).rows[0].c;
  const minePools = (await p.query(
    'select count(*)::int c from pools where id = any($1::uuid[])', [createdPools],
  )).rows[0].c;
  const requests = (await p.query('select count(*)::int c from ride_requests')).rows[0].c;
  const pools = (await p.query('select count(*)::int c from pools')).rows[0].c;
  const online = (await p.query(
    'select count(*)::int c from driver_profiles where is_online or current_zone_id is not null',
  )).rows[0].c;
  await p.end();
  return { mine, minePools, requests, pools, online };
})();

console.log(`\nbaseline before: ${JSON.stringify(baseline)}`);
console.log(`after cleanup:   ${JSON.stringify(leftovers)}`);
check("every row this test created is gone", leftovers.mine === 0, leftovers.mine);
check('every pool this test created is gone', leftovers.minePools === 0, leftovers.minePools);
check('pre-existing requests are untouched', leftovers.requests === baseline.requests,
  { was: baseline.requests, now: leftovers.requests });
check('pre-existing pools are untouched', leftovers.pools === baseline.pools,
  { was: baseline.pools, now: leftovers.pools });

console.log(`\n${fail === 0 ? 'ALL PASS' : `${fail} FAILURE(S)`}`);
process.exit(fail === 0 ? 0 : 1);
