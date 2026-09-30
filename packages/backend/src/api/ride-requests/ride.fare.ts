// The fare rule, in one place.
//
// PLACEHOLDER NUMBERS, agreed as such. They are deliberately isolated in this file
// rather than inlined in the matching service, so replacing them with real pricing later
// is an edit to one file and not a search. Anything derived from them (the join
// threshold, the minimum pool size) is derived here too for the same reason.
//
// Every amount is in POISHA, because `ride_requests.fare_amount` is an integer column:
// 100 poisha is ৳1. Storing taka as an integer would make ৳12.50 inexpressible, and
// storing decimals in an integer column would mean rounding twice.
export const FARE = {
  /** ৳50, charged once per ride regardless of distance. */
  BASE_POISHA: 5000,

  /** ৳25 per whole kilometre. See `chargeableDistanceKm` for why it is whole. */
  PER_KM_POISHA: 2500,

  /**
   * ৳20 off per passenger once the pool is shared.
   *
   * Per passenger, not per pool: the saving scales with how many people are in the car,
   * which is what makes sharing attractive rather than a one-off coupon.
   */
  POOL_DISCOUNT_POISHA: 2000,

  /** A discount needs someone to share with, so it starts at two. */
  POOL_DISCOUNT_MIN_PASSENGERS: 2,
} as const;

/**
 * How close two areas' centres must be for one passenger to join another's pool.
 *
 * ৳3 km is the placeholder. It is a hard threshold rather than a "roughly nearby"
 * judgement because the rule has to be reproducible: two passengers looking at the same
 * pool must agree on who qualifies, and only a number guarantees that.
 */
export const MAX_JOIN_DISTANCE_KM = 3;

/**
 * The distance actually charged for.
 *
 * Rounded UP to a whole kilometre, so a 0.4 km hop is billed as 1 km. Rounding up rather
 * than to nearest keeps the fare monotonic in distance -- a longer trip never costs less
 * -- which rounding to nearest would break at the boundaries (1.4 km -> 1, 1.6 km -> 2 is
 * fine, but 1.5 km -> 2 and 1.51 km -> 2 with a dip is not).
 *
 * `Math.ceil` of a tiny positive number is 1, never 0, so even same-centre areas pay one
 * kilometre. That is correct here: the check constraint already forbids a trip within one
 * area, so this only ever sees a real distance.
 */
export function chargeableDistanceKm(km: number): number {
  return Math.max(1, Math.ceil(km));
}

/** What one passenger pays before any pool discount. */
export function grossFarePoisha(km: number): number {
  return FARE.BASE_POISHA + chargeableDistanceKm(km) * FARE.PER_KM_POISHA;
}

/**
 * The final fare for a passenger, given how many passengers share the ride.
 *
 * `passengerCount` is the number of riders in the pool INCLUDING this one, so a pool of
 * two gives each rider the discount. Returns 0 for a nonsense count rather than a
 * negative fare: a bad count is a bug in the caller, and clamping keeps it from becoming
 * money owed in the other direction.
 */
export function farePoisha(km: number, passengerCount: number): number {
  const gross = grossFarePoisha(km);
  if (passengerCount < FARE.POOL_DISCOUNT_MIN_PASSENGERS) return gross;

  return Math.max(0, gross - FARE.POOL_DISCOUNT_POISHA);
}
